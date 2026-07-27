export function localizedObject(obj: any, locale: string): unknown {
  const targetLanguage = locale?.toLowerCase();

  // Admin → return raw
  if (targetLanguage === 'admin') return obj;

  // Base case: primitives
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'bigint') return obj.toString();
    return obj;
  }

  // ✅ Detect Date
  if (obj instanceof Date) {
    // TODO: replace with DST-correct Intl conversion before Oct 2026 (Egypt switches back to UTC+2).
    const adjustedDate = new Date(obj.getTime() + 3 * 60 * 60 * 1000);
    return adjustedDate.toISOString();
  }

  // ✅ Detect Prisma Decimal object and convert to string
  if (
    obj.constructor?.name === 'Decimal' ||
    ('d' in obj && 'e' in obj && 's' in obj)
  ) {
    try {
      return obj.toString(); // Prisma Decimal has .toString()
    } catch {
      return String(obj); // fallback
    }
  }

  // Detect localized object: { en: "...", ar: "..." }
  const keys = Object.keys(obj);
  const isLocalizedObjectCandidate =
    keys.length > 0 && keys.every((key) => /^[a-z]{2}$/.test(key));

  if (isLocalizedObjectCandidate) {
    return obj[targetLanguage] ?? obj['en'] ?? '';
  }

  // Arrays → recurse
  if (Array.isArray(obj)) {
    return obj.map((item) => localizedObject(item, targetLanguage));
  }

  // Regular object → recurse
  const newObj: { [key: string]: unknown } = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[key] = localizedObject(obj[key], targetLanguage);
    }
  }

  return newObj;
}
