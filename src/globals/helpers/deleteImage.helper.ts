import { HandelFiles } from 'src/_modules/media/helpers/handel-types';

export const deleteImage = (path: string) => {
  HandelFiles.deleteFile(path);
};
