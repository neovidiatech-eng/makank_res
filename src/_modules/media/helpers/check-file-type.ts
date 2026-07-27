export function isMulterFile(obj: unknown): obj is UploadedFile {
  return (
    obj && typeof obj === 'object' && 'fieldname' in obj && 'mimetype' in obj
  );
}

export function isMulterFiles(obj: any): obj is UploadedFile[] {
  return Array.isArray(obj) && isMulterFile(obj?.at(0));
}

export function isMulterFilesObject(
  obj: unknown,
): obj is { [key: string]: UploadedFile[] } {
  return (
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    isMulterFiles(Object.values(obj)?.at(0))
  );
}
