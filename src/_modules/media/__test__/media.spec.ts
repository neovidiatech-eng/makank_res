import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { MediaModule } from '../media.module';

describe('Media', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MediaModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
