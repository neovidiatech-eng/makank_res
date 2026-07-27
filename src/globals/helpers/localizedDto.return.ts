export function localizedDto(obj: unknown) {
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (key.endsWith('Default')) {
        const baseName = key.slice(0, -7);
        const enKey = `${baseName}En`;
        const arKey = `${baseName}Ar`;

        if (!(enKey in obj)) {
          obj[enKey] = obj[key];
        }

        if (!(arKey in obj)) {
          obj[arKey] = obj[key];
        }

        delete obj[key];
      }
    }
  }
  return obj;
}
