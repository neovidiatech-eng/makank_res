import * as fs from 'fs/promises'; // For asynchronous file system operations
import * as path from 'path'; // For handling file paths

export async function copyAndRenameFolder(
  sourcePath: string,
  destinationBasePath: string,
  newFolderName: string,
): Promise<void> {
  const newFolderPath = path.join(destinationBasePath, newFolderName);

  try {
    await fs.cp(sourcePath, newFolderPath, {
      recursive: true,
      errorOnExist: false,
    });
    // eslint-disable-next-line no-console
    console.log(`Folder copied from '${sourcePath}' to '${newFolderPath}'`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to copy folder: ${error.message}`);
    throw error;
  }
}
