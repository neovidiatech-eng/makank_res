import * as fs from 'fs';
import * as path from 'path';
import { handelSucceededTemp } from './handel-temp-files';
import { renameFile } from './rename-file';
export class HandelFiles {
  private baseFolder?: string | number;
  constructor(baseFolder: string | number) {
    this.baseFolder = baseFolder;
  }

  handelFilesObjectTemp(filesObject: { [key: string]: UploadedFile[] }) {
    Object.values(filesObject).map((files) => {
      if (files) return handelSucceededTemp(files, this.baseFolder);
    });
  }

  handelFileTemp(file: UploadedFile) {
    if (!file?.path) return;
    return renameFile(
      file.path,
      HandelFiles.path(file.path, this.baseFolder),
    );
  }

  static path(
    filePath: string | undefined,
    baseFolder?: string | number | undefined,
  ) {
    if (!filePath) return '';
    const tempKey = env('TEMP_FILE_KEY') ?? '';
    const interceptorKey = env('INTERCEPTOR_KEY') ?? '';

    const clean = (p: string) =>
      p.replace(tempKey, '').replace(interceptorKey, '');

    if (baseFolder) {
      const dir = path.dirname(filePath);
      const folderStr = String(baseFolder);
      if (
        dir.endsWith(folderStr) ||
        dir.endsWith(`/${folderStr}`) ||
        dir.endsWith(`\\${folderStr}`)
      ) {
        return clean(path.join(dir, path.basename(filePath)));
      }
      return clean(path.join(dir, folderStr, path.basename(filePath)));
    }

    return clean(path.join(path.dirname(filePath), path.basename(filePath)));
  }

  static generatePath<DTOType>(
    files: any,
    dto: DTOType,
    parentPath?: string | number,
  ) {
    if (!files) return;
    for (const key of Object.keys(files)) {
      if (Array.isArray(files[key])) {
        dto[key] = files[key].map((file) => {
          if (file?.path) return HandelFiles.path(file.path, parentPath);
        });
      } else {
        if (files[key]?.path)
          dto[key] = HandelFiles.path(files[key].path, parentPath);
      }
    }
  }

  static handelReplaced<FilesType, CurrentDocsType>(
    files: FilesType,
    currentDocs: CurrentDocsType,
  ) {
    if (!files || !currentDocs) return;
    for (const key of Object.keys(files)) {
      if (Array.isArray(files[key])) {
        files[key].map((file) => {
          if (file?.path && currentDocs[key] && file.path !== currentDocs[key]) {
            renameFile(file.path, currentDocs[key]);
          }
        });
      } else {
        if (files[key]?.path && currentDocs[key] && files[key].path !== currentDocs[key]) {
          renameFile(files[key].path, currentDocs[key]);
        }
      }
    }
  }
  static deleteFile(filePath: string) {
    if (!filePath) return;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
