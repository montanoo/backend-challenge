import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { CoreService } from '../core/core.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

const POLL_INTERVAL_MS = 100;

export type PaymentResponse = {
  id: number;
  amount: string;
  currency: string;
  status: string;
  coreReference: string;
  createdAt: string;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

@Injectable()
export class PaymentsService {
  private readonly waitTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: CoreService,
    config: ConfigService,
  ) {
    this.waitTimeoutMs =
      Number(config.getOrThrow<string>('CORE_DELAY_MS')) * 2 + 1000;
  }

  async create(key: string, dto: CreatePaymentDto): Promise<PaymentResponse> {
    const requestHash = this.hashRequest(dto);

    try {
      await this.prisma.idempotencyKey.create({
        data: { key, requestHash, status: 'IN_PROGRESS' },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return this.handleExisting(key, requestHash);
      }
      throw err;
    }

    return this.process(key, dto);
  }

  private async process(
    key: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentResponse> {
    const amount = dto.amount.toFixed(2);

    let result: Awaited<ReturnType<CoreService['charge']>>;
    try {
      result = await this.core.charge(amount, dto.currency);
    } catch (err) {
      await this.prisma.idempotencyKey.delete({ where: { key } });
      throw err;
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          amount,
          currency: dto.currency,
          status: result.status,
          coreReference: result.reference,
          idempotencyKey: { connect: { key } },
        },
      });

      const body: PaymentResponse = {
        id: payment.id,
        amount: payment.amount.toFixed(2),
        currency: payment.currency,
        status: payment.status,
        coreReference: payment.coreReference,
        createdAt: payment.createdAt.toISOString(),
      };

      await tx.idempotencyKey.update({
        where: { key },
        data: { status: 'COMPLETED', responseStatus: 201, responseBody: body },
      });

      return body;
    });
  }

  private async handleExisting(
    key: string,
    requestHash: string,
  ): Promise<PaymentResponse> {
    const deadline = Date.now() + this.waitTimeoutMs;

    while (Date.now() < deadline) {
      const row = await this.prisma.idempotencyKey.findUnique({
        where: { key },
      });

      if (!row) {
        throw new ConflictException(
          'The original request failed, retry with the same Idempotency-Key',
        );
      }
      if (row.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different payload',
        );
      }
      if (row.status === 'COMPLETED') {
        return row.responseBody as PaymentResponse;
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new ConflictException(
      'A request with this Idempotency-Key is still in progress',
    );
  }

  private hashRequest(dto: CreatePaymentDto): string {
    const canonical = JSON.stringify({
      amount: dto.amount,
      currency: dto.currency,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }
}
