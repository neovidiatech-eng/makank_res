import { rename } from 'fs/promises';
import { join } from 'path';
import { HandelFiles } from 'src/_modules/media/helpers/handel-types';

export function mapUploads<DTO>(
  data: DTO,
  files: UploadedFiles | UploadedFile | any,
  isInterceptor = false,
) {
  if (!files) return data;
  if (!Object?.keys(files)?.length) return data;
  let arrangedFiles = {};

  if (!Array.isArray(files) && Array.isArray(Object.values(files)?.at(0))) {
    Object.keys(files).forEach(
      (key) =>
        (arrangedFiles[key] = isInterceptor
          ? wrapInterceptor(files[key]?.at(0))
          : files[key]?.at(0)),
    );

    HandelFiles.generatePath<DTO>(arrangedFiles, data);
  } else {
    if (Array.isArray(files)) {
      arrangedFiles = {
        [files?.at(0)?.fieldname]: files.map((file) =>
          isInterceptor ? wrapInterceptor(file) : file,
        ),
      };
    } else {
      arrangedFiles = {
        [files.fieldname]: isInterceptor ? wrapInterceptor(files) : files,
      };
    }
    HandelFiles.generatePath<DTO>(arrangedFiles, data);
  }

  return data;
}

function wrapInterceptor(file) {
  return {
    ...file,
    path: file?.path + env('INTERCEPTOR_KEY'),
  };
}
export async function renameFile(
  oldPath: string,
  newName: string,
  directory: string = './uploads',
): Promise<string> {
  const oldFilePath = join(directory, oldPath);
  const newFilePath = join(directory, newName);

  try {
    await rename(oldFilePath, newFilePath);
    return newFilePath;
  } catch (error) {
    throw new Error(`Failed to rename file: ${error.message}`);
  }
}
