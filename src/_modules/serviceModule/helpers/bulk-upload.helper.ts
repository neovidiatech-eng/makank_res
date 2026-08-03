import * as ExcelJS from 'exceljs';
import { BULK_UPLOAD_COLUMNS } from '../dto/bulk-upload.dto';

export interface ParsedVariant {
  name: string;
  price: number;
  priceAfterDiscount?: number;
}

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
  sizes: ParsedVariant[];
  addons: ParsedVariant[];
  // Human-readable Arabic messages — malformed entries in the sizes/addons
  // cells never throw or silently drop data, they surface here so the row
  // can be reported as "failed" with a specific reason, same as every other
  // validation error in this feature.
  variantErrors: string[];
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

const AVAILABLE_YES = ['نعم', 'yes', 'true', '1'];
const AVAILABLE_NO = ['لا', 'no', 'false', '0'];

// Returns null (not a boolean) for anything that isn't a recognized yes/no
// value, so the caller can report a clear per-row error instead of quietly
// treating a typo as "available" (or "not available").
const cellToAvailable = (value: unknown): boolean | null => {
  const str = cellToString(value).toLowerCase();
  if (!str) return true; // default: available
  if (AVAILABLE_YES.includes(str)) return true;
  if (AVAILABLE_NO.includes(str)) return false;
  return null;
};

// Sizes/addons cells look like: "صغير:50;وسط:70:65;كبير:90" — each entry is
// name:price[:priceAfterDiscount], entries separated by ; or ؛ or a newline.
// The FIRST size entry in the list is treated as the default size. Names are
// entered once (Arabic) and mirrored to English, same convention as the
// product name columns and the same convention ValidateName() already
// applies for manually-created products/categories/bundles.
const ENTRY_SEPARATOR = /[;؛\n]+/;

function parseVariantsCell(raw: string, label: string): {
  variants: ParsedVariant[];
  errors: string[];
} {
  const errors: string[] = [];
  const variants: ParsedVariant[] = [];
  const str = (raw ?? '').trim();
  if (!str) return { variants, errors };

  const entries = str
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const segments = entry.split(':').map((s) => s.trim());
    const [name, priceStr, discountStr] = segments;

    if (!name || priceStr === undefined || priceStr === '') {
      errors.push(
        `"${entry}" في عمود ${label} — الصيغة غلط، المفروض تكون الاسم:السعر أو الاسم:السعر:السعر بعد الخصم`,
      );
      continue;
    }

    const price = Number(priceStr);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push(`"${entry}" في عمود ${label} — السعر لازم يكون رقم أكبر من صفر`);
      continue;
    }

    let priceAfterDiscount: number | undefined;
    if (discountStr !== undefined && discountStr !== '') {
      const discount = Number(discountStr);
      if (!Number.isFinite(discount) || discount < 0) {
        errors.push(`"${entry}" في عمود ${label} — سعر الخصم لازم يكون رقم صفر أو أكبر`);
        continue;
      }
      if (discount >= price) {
        errors.push(`"${entry}" في عمود ${label} — سعر الخصم لازم يكون أقل من السعر الأصلي`);
        continue;
      }
      priceAfterDiscount = discount;
    }

    variants.push({
      name,
      price,
      ...(priceAfterDiscount !== undefined && { priceAfterDiscount }),
    });
  }

  return { variants, errors };
}

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
    const availableRaw = cellToAvailable(values[9]);
    const sizesRaw = cellToString(values[10]);
    const addonsRaw = cellToString(values[11]);

    // Entirely blank row (e.g. trailing empty rows in the sheet) — skip
    // silently, it's not a data-entry mistake worth reporting as "failed".
    if (!categoryAr && !nameAr && !nameEn && price == null) return;

    const variantErrors: string[] = [];
    if (availableRaw === null) {
      variantErrors.push(
        `عمود "متاح" — اكتب نعم أو لا بس، مش أي نص تاني`,
      );
    }

    const sizesResult = parseVariantsCell(sizesRaw, 'الأحجام');
    const addonsResult = parseVariantsCell(addonsRaw, 'الإضافات');
    variantErrors.push(...sizesResult.errors, ...addonsResult.errors);

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
      available: availableRaw ?? true,
      sizes: sizesResult.variants,
      addons: addonsResult.variants,
      variantErrors,
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
    sizes: '',
    addons: '',
  });

  sheet.addRow({
    categoryAr: 'ساندوتشات',
    nameAr: 'برجر لحم',
    nameEn: 'Beef Burger',
    descriptionAr: 'برجر لحم مشوي',
    descriptionEn: 'Grilled beef burger',
    price: 80,
    priceAfterDiscount: '',
    durationMinutes: 15,
    available: 'نعم',
    sizes: 'صغير:80;وسط:100:90;كبير:130',
    addons: 'جبنة إضافية:10;صوص حار:5:3',
  });

  const instructions = workbook.addWorksheet('تعليمات');
  instructions.columns = [{ width: 90 }];
  instructions.addRows([
    ['أعمدة "الأحجام" و"الإضافات" اختيارية — اسيبها فاضية لو المنتج مالوش أحجام أو إضافات.'],
    ['الصيغة: الاسم:السعر أو الاسم:السعر:السعر بعد الخصم — وافصل بين كل حجم/إضافة بفاصلة منقوطة ؛'],
    ['مثال أحجام: صغير:80;وسط:100:90;كبير:130  (يعني وسط سعره 100 وبعد الخصم 90)'],
    ['أول حجم مكتوب في العمود هو الحجم الافتراضي اللي بيظهر للعميل.'],
    ['مثال إضافات: جبنة إضافية:10;صوص حار:5:3'],
    ['اكتب اسم الحجم/الإضافة بالعربي بس — هيتسجل تلقائي بنفس الاسم بالإنجليزي.'],
  ]);
  instructions.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
