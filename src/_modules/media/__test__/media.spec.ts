import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from 'src/globals/services/prisma.service';
import { MediaModule } from '../media.module';

import * as fs from 'fs';
import * as path from 'path';

describe('Media', () => {
  let app: INestApplication;
  const testUploadsDir = path.join(process.cwd(), 'uploads');
  const testFile = path.join(testUploadsDir, 'default.png');

  beforeAll(async () => {
    if (!fs.existsSync(testUploadsDir)) {
      fs.mkdirSync(testUploadsDir, { recursive: true });
    }
    if (!fs.existsSync(testFile)) {
      fs.writeFileSync(testFile, 'dummy content');
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MediaModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        user: { findMany: jest.fn().mockResolvedValue([]) },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch (_) {}
    }
  });

  it('found file', () => {
    return request(app.getHttpServer())
      .get('/media')
      .query({ media: 'default.png' })
      .expect(200);
  });
  it('not found file', () => {
    return request(app.getHttpServer())
      .get('/media')
      .query({ media: 'default.pn' })
      .expect(404);
  });
});
