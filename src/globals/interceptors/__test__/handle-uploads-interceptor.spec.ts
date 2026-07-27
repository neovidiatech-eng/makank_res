import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { of } from 'rxjs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MapUploadsInterceptor } from '../handle-uploads-interceptor';

const buildContext = (request: any) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;

const nextHandler = { handle: () => of('ok') } as any;

describe('MapUploadsInterceptor — rejects truncated image uploads', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'upload-interceptor-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws and deletes the file when a JPEG is missing its EOI marker', () => {
    const filePath = join(dir, 'bad.jpg');
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 1, 2, 3]));

    const request = {
      body: {},
      file: { fieldname: 'image', mimetype: 'image/jpeg', path: filePath },
    };

    const interceptor = new MapUploadsInterceptor();

    expect(() =>
      interceptor.intercept(buildContext(request), nextHandler),
    ).toThrow(BadRequestException);
    expect(existsSync(filePath)).toBe(false);
  });

  it('passes through a valid JPEG unchanged', () => {
    const filePath = join(dir, 'good.jpg');
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]));

    const request = {
      body: {},
      file: { fieldname: 'image', mimetype: 'image/jpeg', path: filePath },
    };

    const interceptor = new MapUploadsInterceptor();

    expect(() =>
      interceptor.intercept(buildContext(request), nextHandler),
    ).not.toThrow();
    expect(existsSync(filePath)).toBe(true);
  });
});
