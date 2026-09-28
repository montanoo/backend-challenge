import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (value === undefined || value === '') {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('Idempotency-Key header must be sent once');
    }
    if (!isUUID(value)) {
      throw new BadRequestException('Idempotency-Key must be a UUID');
    }
    return value;
  }
}
