// ServiceModuleService.bulkUploadFromExcel — one row per product, each row
// succeeds or fails independently (a bad row never blocks the rest), and
// categories are resolved by name or created on the fly.
import * as ExcelJS from 'exceljs';
import { ServiceModuleService } from '../services/storeModule.service';

const buildWorkbookBuffer = async (rows: any[][]) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.addRow([
    'القسم',
    'اسم المنتج',
    'Product Name (English)',
    'الوصف',
    'Description (English)',
    'السعر',
    'السعر بعد الخصم',
    'مدة التحضير بالدقايق',
    'متاح (نعم/لا)',
    'الأحجام',
    'الإضافات',
  ]);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const buildService = (
  overrides: {
    existingCategory?: any;
    createServiceImpl?: jest.Mock;
  } = {},
) => {
  const prisma = {
    category: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingCategory ?? null),
      create: jest.fn().mockResolvedValue({ id: 999 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Ahmed' }) },
  };
  const logsService = { createLog: jest.fn() };
  const service = new ServiceModuleService(
    prisma as any,
    undefined as any,
    undefined as any,
    undefined as any,
    logsService as any,
  );
  // create() itself is exercised elsewhere (assertStoreAccepted, tx, etc.) —
  // here we only care about bulkUploadFromExcel's own row-handling logic, so
  // stub the actual creation to isolate it.
  service.create = overrides.createServiceImpl ?? jest.fn().mockResolvedValue(undefined);
  return { service, prisma, logsService };
};

const storeUser = { id: 5, storeId: 9, Role: { roleKey: 'Store' } } as any;

describe('ServiceModuleService.bulkUploadFromExcel', () => {
  it('creates every valid row and reports a clean summary', async () => {
    const { service, logsService } = buildService({
      existingCategory: { id: 700 },
    });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير مانجو', 'Mango Juice', '', '', 35, '', 5, 'نعم'],
      ['مشروبات', 'عصير برتقال', '', '', '', 30, '', '', ''],
    ]);

    const summary = await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(summary.totalRows).toBe(2);
    expect(summary.createdCount).toBe(2);
    expect(summary.failedCount).toBe(0);
    expect(service.create).toHaveBeenCalledTimes(2);
    expect(logsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SERVICES_BULK_UPLOADED',
        storeId: 9,
        details: expect.stringContaining('2 created, 0 failed'),
      }),
    );
  });

  it('fails only the bad row and still creates the rest', async () => {
    const { service } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير مانجو', '', '', '', 35, '', '', ''],
      ['مشروبات', 'صنف بدون سعر', '', '', '', '', '', '', ''], // missing price
      ['', 'صنف بدون قسم', '', '', '', 20, '', '', ''], // missing category
    ]);

    const summary = await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(summary.createdCount).toBe(1);
    expect(summary.failedCount).toBe(2);
    expect(summary.results[1]).toMatchObject({ row: 3, status: 'failed' });
    expect(summary.results[2]).toMatchObject({ row: 4, status: 'failed' });
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing category by name instead of creating a duplicate', async () => {
    const { service, prisma } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير مانجو', '', '', '', 35, '', '', ''],
    ]);

    await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 700 }),
    );
  });

  it('creates a new category when none matches the name yet', async () => {
    const { service, prisma } = buildService({ existingCategory: null });
    const buffer = await buildWorkbookBuffer([
      ['قسم جديد', 'صنف', '', '', '', 10, '', '', ''],
    ]);

    await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: { ar: 'قسم جديد', en: 'قسم جديد' },
          storeId: 9,
        }),
      }),
    );
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 999 }),
    );
  });

  it('does not write an audit log entry when no user is passed', async () => {
    const { service, logsService } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير', '', '', '', 10, '', '', ''],
    ]);

    await service.bulkUploadFromExcel(9, buffer);

    expect(logsService.createLog).not.toHaveBeenCalled();
  });

  it('passes parsed Sizes/Addons through to create(), with the first size marked default', async () => {
    const { service } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      [
        'ساندوتشات',
        'برجر',
        '',
        '',
        '',
        80,
        '',
        '',
        '',
        'صغير:80;وسط:100:90',
        'جبنة إضافية:10',
      ],
    ]);

    await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        Sizes: [
          { name: { ar: 'صغير', en: 'صغير' }, price: 80, isDefault: true },
          {
            name: { ar: 'وسط', en: 'وسط' },
            price: 100,
            priceAfterDiscount: 90,
            isDefault: false,
          },
        ],
        Addons: [{ name: { ar: 'جبنة إضافية', en: 'جبنة إضافية' }, price: 10 }],
      }),
    );
  });

  it('fails the row with a clear reason instead of silently dropping a malformed size', async () => {
    const { service } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      ['ساندوتشات', 'برجر', '', '', '', 80, '', '', '', 'صغير', ''],
    ]);

    const summary = await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(summary.failedCount).toBe(1);
    expect(summary.results[0]).toMatchObject({ status: 'failed' });
    expect(summary.results[0].reason).toEqual(expect.stringContaining('صغير'));
    expect(service.create).not.toHaveBeenCalled();
  });
});
