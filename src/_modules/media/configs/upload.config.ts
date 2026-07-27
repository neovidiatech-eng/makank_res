import * as path from 'path';

export type UploadTypes = 'image' | 'video' | 'attachment' | 'many';

export const uploadPath = (
  uploadType: UploadTypes,
  module: string,
  customPath = '',
) => {
  if (uploadType === 'many') return path.join(module, customPath);
  return path.join(module, uploadType, customPath);
};
