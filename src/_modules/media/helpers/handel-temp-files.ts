import * as fs from 'fs/promises';
import * as path from 'path';
import {
  isMulterFile,
  isMulterFiles,
  isMulterFilesObject,
} from './check-file-type';
import { HandelFiles } from './handel-types';
import { renameFile } from './rename-file';
export function handelSucceededTemp(
  file_s:
    | string
    | string[]
    | UploadedFile
    | UploadedFile[]
    | { [key: string]: UploadedFile[] },
  baseFolder?: string | number,
) {
  const handelPath = new HandelFiles(baseFolder);

  if (isMulterFilesObject(file_s))
    return handelPath.handelFilesObjectTemp(file_s);

  if (isMulterFile(file_s)) return handelPath.handelFileTemp(file_s);

  if (isMulterFiles(file_s)) {
    return file_s.map((file) => {
      if (file) return handelSucceededTemp(file, baseFolder);
    });
  }

  if (typeof file_s === 'string') {
    return renameFile(file_s, HandelFiles.path(file_s, baseFolder));
  }

  if (Array.isArray(file_s)) {
    file_s.forEach((file) => {
      if (file) renameFile(file, HandelFiles.path(file, baseFolder));
    });
  }
}

/**
 * Deletes multiple files
 */
export async function deleteFiles(files?: UploadedFile[] | any) {
  await Promise.all(files.map((file) => deleteFile(file)));
}

/**
 * Deletes a single file
 */
export async function deleteFile(file?: UploadedFile) {
  if (!file?.path) {
    throw new Error('Invalid file object: missing path property');
  }

  const dirPath = path.join(
    __dirname,
    '../../..',
    process.env.UPLOADS_PATH || 'uploads',
  );
  const itemPath = path.join(dirPath, '../../..', file.path);
  try {
    await fs.unlink(itemPath); // Note: using fs.promises.unlink, not unlinkSync
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // Ignore "file not found" errors
      throw error;
    }
  }
}
