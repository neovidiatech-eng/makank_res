// Column order for the bulk product Excel upload/template — kept in one
// place since both the parser and the template generator must agree on it.
export const BULK_UPLOAD_COLUMNS = [
  { key: 'categoryAr', header: 'القسم' },
  { key: 'nameAr', header: 'اسم المنتج' },
  { key: 'nameEn', header: 'Product Name (English)' },
  { key: 'descriptionAr', header: 'الوصف' },
  { key: 'descriptionEn', header: 'Description (English)' },
  { key: 'price', header: 'السعر' },
  { key: 'priceAfterDiscount', header: 'السعر بعد الخصم' },
  { key: 'durationMinutes', header: 'مدة التحضير بالدقايق' },
  { key: 'available', header: 'متاح (نعم/لا)' },
  { key: 'sizes', header: 'الأحجام (اختياري - شوف شيت التعليمات)' },
  { key: 'addons', header: 'الإضافات (اختياري - شوف شيت التعليمات)' },
] as const;

export interface BulkUploadRowResult {
  row: number;
  productName?: string;
  status: 'created' | 'failed';
  reason?: string;
}

export interface BulkUploadSummary {
  totalRows: number;
  createdCount: number;
  failedCount: number;
  results: BulkUploadRowResult[];
}
