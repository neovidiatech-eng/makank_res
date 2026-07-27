import * as fs from 'fs';
import * as path from 'path';

export function renameFile(currentPath: string, distention: string) {
  let actualPath = currentPath;
  const interceptorKey = process.env.INTERCEPTOR_KEY || '';
  if (interceptorKey && actualPath.endsWith(interceptorKey)) {
    actualPath = actualPath.slice(0, -interceptorKey.length);
  }

  if (!fs.existsSync(actualPath)) return;

  if (!fs.existsSync(path.dirname(distention)))
    fs.mkdirSync(path.dirname(distention), { recursive: true });

  return fs.renameSync(actualPath, distention);
}
