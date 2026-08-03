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
    store: {
      findUnique: jest.fn().mockResolvedValue({ isStoreAccepted: true }),
      update: jest.fn(),
    },
    serviceSize: { aggregate: jest.fn().mockResolvedValue({ _min: { price: null } }) },
    service: { aggregate: jest.fn().mockResolvedValue({ _min: { price: null } }) },
  };
  const logsService = { createLog: jest.fn() };
  const helper = {
    hasValidDiscount: (price: number, discount?: number | null) =>
      discount != null && discount >= 0 && discount < price,
  };
  const service = new ServiceModuleService(
    prisma as any,
    undefined as any,
    helper as any,
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
      expect.anything(),
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
      expect.anything(),
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
      expect.anything(),
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

  it('rejects the whole batch upfront with one clear error when the store is not yet approved', async () => {
    const { service, prisma } = buildService({ existingCategory: { id: 700 } });
    prisma.store.findUnique.mockResolvedValue({ isStoreAccepted: false });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير', '', '', '', 10, '', '', ''],
    ]);

    await expect(service.bulkUploadFromExcel(9, buffer, storeUser)).rejects.toThrow(
      'Your store is still pending admin review',
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('resolves a repeated category name only once across the whole upload', async () => {
    const { service, prisma } = buildService({ existingCategory: null });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير مانجو', '', '', '', 30, '', '', ''],
      ['مشروبات', 'عصير برتقال', '', '', '', 25, '', '', ''],
      ['مشروبات', 'عصير ليمون', '', '', '', 20, '', '', ''],
    ]);

    const summary = await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(summary.createdCount).toBe(3);
    expect(prisma.category.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.category.create).toHaveBeenCalledTimes(1);
  });

  it('recomputes the store min price once after the whole batch, not per row', async () => {
    const { service, prisma } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير مانجو', '', '', '', 30, '', '', ''],
      ['مشروبات', 'عصير برتقال', '', '', '', 25, '', '', ''],
    ]);

    await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(prisma.store.update).toHaveBeenCalledTimes(1);
  });

  it('fails a row instead of silently dropping an invalid whole-product discount', async () => {
    const { service } = buildService({ existingCategory: { id: 700 } });
    const buffer = await buildWorkbookBuffer([
      ['مشروبات', 'عصير', '', '', '', 30, 30, '', ''], // discount == price
    ]);

    const summary = await service.bulkUploadFromExcel(9, buffer, storeUser);

    expect(summary.failedCount).toBe(1);
    expect(summary.results[0].reason).toEqual(
      expect.stringContaining('السعر بعد الخصم'),
    );
    expect(service.create).not.toHaveBeenCalled();
  });
});
