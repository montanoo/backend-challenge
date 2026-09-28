import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { IntegrationJwtVerifier } from './integration-jwt.verifier.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly ttlMinutes: number;
  constructor(
    private readonly verifier: IntegrationJwtVerifier,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlMinutes = Number(
      config.getOrThrow<string>('INTEGRATION_TOKEN_TTL_MINUTES'),
    );
  }

  async loginIntegration(jwt: string) {
    await this.verifier.verify(jwt);

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    await this.prisma.integrationToken.create({
      data: { tokenHash: this.hash(token), expiresAt },
    });

    return { integrationToken: token, expiresAt };
  }

  async redeemToken(integrationToken: string) {
    const now = new Date();

    const { count } = await this.prisma.integrationToken.updateMany({
      where: {
        tokenHash: this.hash(integrationToken),
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (count === 0) {
      throw new UnauthorizedException('Invalid or already used token');
    }

    return { redeemed: true, redeemedAt: now };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
