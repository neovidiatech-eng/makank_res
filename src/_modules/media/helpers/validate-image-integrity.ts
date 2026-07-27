import { openSync, readSync, closeSync, statSync } from 'fs';

// JPEG files must contain the End-Of-Image marker (0xFFD9) at/near the end.
// PNG files must contain the IEND chunk at/near the end. A file missing this
// trailer entirely was truncated during upload/transfer — browsers often
// render the partial bytes anyway, but strict decoders (e.g. Flutter/Skia)
// reject it outright with "Corrupt JPEG data: premature end of data segment"
// or similar.
//
// The marker is searched for within a trailing WINDOW, not required to be the
// literal last bytes of the file: some camera/screenshot tools append extra
// data after the real EOI (EXIF thumbnails, padding, etc.), which is a
// perfectly valid, complete file — a bare "last N bytes must equal the
// marker" check produced false positives on those, rejecting genuine
// customer uploads (e.g. wallet-transfer receipt screenshots) outright.
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const PNG_IEND = Buffer.from('IEND\xae\x42\x60\x82', 'binary');
const TRAILING_WINDOW_BYTES = 65536; // 64KB — generous for any real trailing metadata

function readTrailingBytes(filePath: string, length: number): Buffer {
  const size = statSync(filePath).size;
  const readLength = Math.min(length, size);
  const buffer = Buffer.alloc(readLength);
  const fd = openSync(filePath, 'r');
  try {
    readSync(fd, buffer, 0, readLength, size - readLength);
  } finally {
    closeSync(fd);
  }
  return buffer;
}

// Returns true when the file looks complete for formats we know how to check.
// Unknown/unsupported mimetypes are always treated as intact — this is a
// truncation guard, not a full image validator.
export function isImageFileIntact(filePath: string, mimetype: string): boolean {
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    const tail = readTrailingBytes(filePath, TRAILING_WINDOW_BYTES);
    return tail.includes(JPEG_EOI);
  }
  if (mimetype === 'image/png') {
    const tail = readTrailingBytes(filePath, TRAILING_WINDOW_BYTES);
    return tail.includes(PNG_IEND);
  }
  return true;
}
