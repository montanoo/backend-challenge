import { Module } from '@nestjs/common';
import { CoreService } from './core.service.js';

@Module({
  providers: [CoreService],
  exports: [CoreService],
})
export class CoreModule {}
