import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CoreModule } from './core/core.module.js';
import { PaymentsModule } from './payments/payments.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, CoreModule, PaymentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
