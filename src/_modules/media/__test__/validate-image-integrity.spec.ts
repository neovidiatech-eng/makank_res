import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isImageFileIntact } from '../helpers/validate-image-integrity';

describe('isImageFileIntact', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'image-integrity-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, bytes: number[]) => {
    const filePath = join(dir, name);
    writeFileSync(filePath, Buffer.from(bytes));
    return filePath;
  };

  it('accepts a JPEG ending with the EOI marker (0xFFD9)', () => {
    const filePath = write('ok.jpg', [0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    expect(isImageFileIntact(filePath, 'image/jpeg')).toBe(true);
  });

  it('rejects a JPEG truncated before the EOI marker', () => {
    const filePath = write('truncated.jpg', [0xff, 0xd8, 1, 2, 3, 4, 5]);
    expect(isImageFileIntact(filePath, 'image/jpeg')).toBe(false);
  });

  it('accepts a PNG ending with the IEND chunk', () => {
    const iend = Buffer.from('IEND\xae\x42\x60\x82', 'binary');
    const filePath = write('ok.png', []);
    writeFileSync(filePath, Buffer.concat([Buffer.from([1, 2, 3]), iend]));
    expect(isImageFileIntact(filePath, 'image/png')).toBe(true);
  });

  it('rejects a PNG missing the IEND chunk', () => {
    const filePath = write('truncated.png', [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(isImageFileIntact(filePath, 'image/png')).toBe(false);
  });

  it('does not check formats it has no trailer rule for (e.g. webp)', () => {
    const filePath = write('anything.webp', [1, 2, 3]);
    expect(isImageFileIntact(filePath, 'image/webp')).toBe(true);
  });

  // Regression: some camera/screenshot tools append extra bytes (EXIF
  // thumbnails, padding) AFTER the real EOI marker — a perfectly valid,
  // complete file whose literal last bytes are no longer 0xFFD9. A real
  // customer's wallet-transfer receipt screenshot was rejected by the old
  // "last bytes must equal the marker" check because of exactly this.
  it('accepts a JPEG with trailing metadata appended after the EOI marker', () => {
    const filePath = write('trailing-metadata.jpg', [
      0xff, 0xd8, 1, 2, 3, 0xff, 0xd9, // real image + EOI
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, // extra trailing bytes (e.g. EXIF thumbnail)
    ]);
    expect(isImageFileIntact(filePath, 'image/jpeg')).toBe(true);
  });

  it('accepts a PNG with trailing bytes appended after the IEND chunk', () => {
    const iend = Buffer.from('IEND\xae\x42\x60\x82', 'binary');
    const filePath = write('trailing-after-iend.png', []);
    writeFileSync(
      filePath,
      Buffer.concat([Buffer.from([1, 2, 3]), iend, Buffer.from([0, 0, 0])]),
    );
    expect(isImageFileIntact(filePath, 'image/png')).toBe(true);
  });
});
