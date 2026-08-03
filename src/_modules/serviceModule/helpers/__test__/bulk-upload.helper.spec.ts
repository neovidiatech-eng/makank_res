import * as ExcelJS from 'exceljs';
import {
  generateBulkUploadTemplate,
  parseBulkUploadWorkbook,
} from '../bulk-upload.helper';

describe('bulk-upload.helper', () => {
  describe('generateBulkUploadTemplate', () => {
    it('produces a workbook whose header row matches what the parser expects, plus worked examples', async () => {
      const buffer = await generateBulkUploadTemplate();
      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        categoryAr: 'مشروبات',
        nameAr: 'عصير مانجو',
        nameEn: 'Mango Juice',
        price: 35,
        available: true,
        sizes: [],
        addons: [],
      });
      // Second example row demonstrates the sizes/addons columns end to end.
      expect(rows[1]).toMatchObject({
        nameAr: 'برجر لحم',
        sizes: [
          { name: 'صغير', price: 80 },
          { name: 'وسط', price: 100, priceAfterDiscount: 90 },
          { name: 'كبير', price: 130 },
        ],
        addons: [
          { name: 'جبنة إضافية', price: 10 },
          { name: 'صوص حار', price: 5, priceAfterDiscount: 3 },
        ],
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
        'الأحجام',
        'الإضافات',
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

    describe('sizes/addons columns', () => {
      it('parses multiple sizes, marks the first as default, and parses per-size discounts', async () => {
        const buffer = await buildWorkbook([
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
            'صغير:80;وسط:100:90;كبير:130',
            '',
          ],
        ]);

        const rows = await parseBulkUploadWorkbook(buffer);

        expect(rows[0].variantErrors).toEqual([]);
        expect(rows[0].sizes).toEqual([
          { name: 'صغير', price: 80 },
          { name: 'وسط', price: 100, priceAfterDiscount: 90 },
          { name: 'كبير', price: 130 },
        ]);
      });

      it('parses addons the same way, without a default flag', async () => {
        const buffer = await buildWorkbook([
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
            '',
            'جبنة إضافية:10;صوص حار:5:3',
          ],
        ]);

        const rows = await parseBulkUploadWorkbook(buffer);

        expect(rows[0].variantErrors).toEqual([]);
        expect(rows[0].addons).toEqual([
          { name: 'جبنة إضافية', price: 10 },
          { name: 'صوص حار', price: 5, priceAfterDiscount: 3 },
        ]);
      });

      it('reports a clear error instead of silently dropping a malformed size entry', async () => {
        const buffer = await buildWorkbook([
          ['ساندوتشات', 'برجر', '', '', '', 80, '', '', '', 'صغير', ''],
        ]);

        const rows = await parseBulkUploadWorkbook(buffer);

        expect(rows[0].sizes).toEqual([]);
        expect(rows[0].variantErrors).toEqual([
          expect.stringContaining('صغير'),
        ]);
      });

      it('rejects a size discount that is not lower than the size price', async () => {
        const buffer = await buildWorkbook([
          ['ساندوتشات', 'برجر', '', '', '', 80, '', '', '', 'وسط:100:100', ''],
        ]);

        const rows = await parseBulkUploadWorkbook(buffer);

        expect(rows[0].sizes).toEqual([]);
        expect(rows[0].variantErrors).toEqual([
          expect.stringContaining('أقل من السعر الأصلي'),
        ]);
      });

      it('leaves sizes/addons empty when both columns are blank', async () => {
        const buffer = await buildWorkbook([
          ['قسم', 'صنف', '', '', '', 10, '', '', '', '', ''],
        ]);

        const rows = await parseBulkUploadWorkbook(buffer);

        expect(rows[0].sizes).toEqual([]);
        expect(rows[0].addons).toEqual([]);
        expect(rows[0].variantErrors).toEqual([]);
      });
    });

    it('reports an error for an unrecognized "available" value instead of silently defaulting', async () => {
      const buffer = await buildWorkbook([
        ['قسم', 'صنف', '', '', '', 10, '', '', 'مش متاح', '', ''],
      ]);

      const rows = await parseBulkUploadWorkbook(buffer);

      expect(rows[0].available).toBe(true);
      expect(rows[0].variantErrors).toEqual([
        expect.stringContaining('متاح'),
      ]);
    });
  });
});
