import { setTimeout as sleep } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CoreService {
  private readonly delayMs: number;

  constructor(config: ConfigService) {
    this.delayMs = Number(config.getOrThrow<string>('CORE_DELAY_MS'));
  }

  async charge(amount: string, currency: string) {
    await sleep(this.delayMs);
    return { reference: randomUUID(), status: 'APPROVED' as const };
  }
}
