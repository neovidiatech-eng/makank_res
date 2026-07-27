import * as ExcelJS from 'exceljs';
import {
  generateBulkUploadTemplate,
  parseBulkUploadWorkbook,
} from '../bulk-upload.helper';

describe('bulk-upload.helper', () => {
  describe('generateBulkUploadTemplate', () => {
    it('produces a workbook whose header row matches what the parser expects, plus one worked example', async () => {
      const buffer = await generateBulkUploadTemplate();
      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        categoryAr: 'مشروبات',
        nameAr: 'عصير مانجو',
        nameEn: 'Mango Juice',
        price: 35,
        available: true,
      });
    });
  });

  describe('parseBulkUploadWorkbook', () => {
    const buildWorkbook = async (rows: any[][]) => {
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
      ]);
      rows.forEach((r) => sheet.addRow(r));
      return Buffer.from(await workbook.xlsx.writeBuffer());
    };

    it('skips the header row and parses data rows correctly', async () => {
      const buffer = await buildWorkbook([
        ['مشروبات', 'عصير برتقال', 'Orange Juice', '', '', 30, '', 5, 'نعم'],
      ]);

      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        rowNumber: 2,
        categoryAr: 'مشروبات',
        nameAr: 'عصير برتقال',
        nameEn: 'Orange Juice',
        price: 30,
        durationMinutes: 5,
        available: true,
      });
    });

    it('defaults "available" to true when blank, and reads "لا" as false', async () => {
      const buffer = await buildWorkbook([
        ['قسم', 'صنف 1', '', '', '', 10, '', '', ''],
        ['قسم', 'صنف 2', '', '', '', 10, '', '', 'لا'],
      ]);

      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows[0].available).toBe(true);
      expect(rows[1].available).toBe(false);
    });

    it('leaves price as null when the cell is blank or non-numeric, instead of throwing', async () => {
      const buffer = await buildWorkbook([
        ['قسم', 'صنف بدون سعر', '', '', '', '', '', '', ''],
      ]);

      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows[0].price).toBeNull();
    });

    it('skips fully blank trailing rows without reporting them', async () => {
      const buffer = await buildWorkbook([
        ['مشروبات', 'عصير', '', '', '', 20, '', '', ''],
        ['', '', '', '', '', '', '', '', ''],
      ]);

      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows).toHaveLength(1);
    });

    it('returns an empty array for a workbook with no rows at all', async () => {
      const buffer = await buildWorkbook([]);
      const rows = await parseBulkUploadWorkbook(buffer);
      expect(rows).toEqual([]);
    });
  });
});
