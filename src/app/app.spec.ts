// src/app/app.spec.ts
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from './app.module';

describe('AppController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'test_secret_for_jwt_auth';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('App', () => {
    return request(app.getHttpServer()).get('/').expect(200);
  });
  // Your test cases here
});
