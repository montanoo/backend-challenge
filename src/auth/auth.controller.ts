import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginIntegrationDto } from './dto/login-integration.dto.js';
import { AuthService } from './auth.service.js';
import { RedeemDto } from './dto/redeem-token.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login-integration')
  @HttpCode(HttpStatus.OK)
  loginIntegration(@Body() dto: LoginIntegrationDto) {
    return this.authService.loginIntegration(dto.token);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  redeem(@Body() dto: RedeemDto) {
    return this.authService.redeemToken(dto.token);
  }
}
