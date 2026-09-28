import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { IdempotencyKey } from './decorator/idempotency-key.decorator.js';
import { IdempotencyKeyPipe } from './pipes/idempotency-key.pipe.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @IdempotencyKey(IdempotencyKeyPipe) key: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(key, dto);
  }
}
