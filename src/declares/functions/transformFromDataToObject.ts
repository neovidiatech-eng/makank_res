export function transformFormDataToObject(formData: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in formData) {
    if (formData.hasOwnProperty(key)) {
      const value = formData[key];
      if (
        typeof value === 'string' &&
        value.startsWith('{') &&
        value.endsWith('}')
      ) {
        try {
          result[key] = JSON.parse(value);
        } catch (_) {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}
