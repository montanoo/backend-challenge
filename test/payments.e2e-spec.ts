import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CoreService } from '../src/core/core.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('POST /payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let chargeSpy: MockInstance<CoreService['charge']>;
  const usedKeys: string[] = [];

  const newKey = () => {
    const key = randomUUID();
    usedKeys.push(key);
    return key;
  };

  const pay = (key: string, body = { amount: 10.5, currency: 'USD' }) =>
    request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', key)
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);

    prisma = app.get(PrismaService);
    chargeSpy = vi.spyOn(app.get(CoreService), 'charge');
  });

  afterEach(() => {
    chargeSpy.mockClear();
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({
      where: { idempotencyKey: { key: { in: usedKeys } } },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { key: { in: usedKeys } },
    });
    await app.close();
  });

  it('calls the core once for two simultaneous requests with the same key', async () => {
    const key = newKey();

    const [first, second] = await Promise.all([pay(key), pay(key)]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(chargeSpy).toHaveBeenCalledTimes(1);
    expect(
      await prisma.payment.count({ where: { idempotencyKey: { key } } }),
    ).toBe(1);
  }, 20_000);

  it('replays the stored result without calling the core again', async () => {
    const key = newKey();

    const first = await pay(key);
    const replay = await pay(key);

    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(chargeSpy).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('rejects a reused key with a different payload', async () => {
    const key = newKey();

    await pay(key);
    const res = await pay(key, { amount: 99, currency: 'USD' });

    expect(res.status).toBe(422);
    expect(chargeSpy).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('rejects a request without an Idempotency-Key', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments')
      .send({ amount: 10.5, currency: 'USD' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/payments',
    });
    expect(chargeSpy).not.toHaveBeenCalled();
  });
});
