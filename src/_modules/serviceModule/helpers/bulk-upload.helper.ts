import * as ExcelJS from 'exceljs';
import { BULK_UPLOAD_COLUMNS } from '../dto/bulk-upload.dto';

export interface BulkUploadRawRow {
  rowNumber: number;
  categoryAr: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  price: number | null;
  priceAfterDiscount: number | null;
  durationMinutes: number | null;
  available: boolean;
}

const cellToString = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in (value as any)) {
    // ExcelJS hyperlink/rich-text cells expose their text this way.
    return String((value as any).text ?? '').trim();
  }
  return String(value).trim();
};

const cellToNumber = (value: unknown): number | null => {
  const str = cellToString(value);
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
};

const cellToAvailable = (value: unknown): boolean => {
  const str = cellToString(value).toLowerCase();
  if (!str) return true; // default: available
  return !['لا', 'no', 'false', '0'].includes(str);
};

// Reads the uploaded workbook's first sheet into plain rows — no DB access,
// no Nest DI — so this is trivially unit-testable on its own.
export async function parseBulkUploadWorkbook(
  buffer: Buffer,
): Promise<BulkUploadRawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: BulkUploadRawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    const values = row.values as unknown[]; // 1-indexed, values[0] unused

    const categoryAr = cellToString(values[1]);
    const nameAr = cellToString(values[2]);
    const nameEn = cellToString(values[3]);
    const descriptionAr = cellToString(values[4]);
    const descriptionEn = cellToString(values[5]);
    const price = cellToNumber(values[6]);
    const priceAfterDiscount = cellToNumber(values[7]);
    const durationMinutes = cellToNumber(values[8]);
    const available = cellToAvailable(values[9]);

    // Entirely blank row (e.g. trailing empty rows in the sheet) — skip
    // silently, it's not a data-entry mistake worth reporting as "failed".
    if (!categoryAr && !nameAr && !nameEn && price == null) return;

    rows.push({
      rowNumber,
      categoryAr,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      price,
      priceAfterDiscount,
      durationMinutes,
      available,
    });
  });

  return rows;
}

// The blank template the store downloads and fills in — same column order
// the parser above reads, with one worked example row.
export async function generateBulkUploadTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('المنتجات');

  sheet.columns = BULK_UPLOAD_COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: 22,
  }));
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    categoryAr: 'مشروبات',
    nameAr: 'عصير مانجو',
    nameEn: 'Mango Juice',
    descriptionAr: 'عصير مانجو طازج',
    descriptionEn: 'Fresh mango juice',
    price: 35,
    priceAfterDiscount: '',
    durationMinutes: 5,
    available: 'نعم',
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
