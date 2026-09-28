import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { IntegrationJwtVerifier } from './integration-jwt.verifier.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, IntegrationJwtVerifier],
})
export class AuthModule {}
