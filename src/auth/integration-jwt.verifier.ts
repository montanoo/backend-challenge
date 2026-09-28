import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errors, JWTPayload, jwtVerify } from 'jose';

@Injectable()
export class IntegrationJwtVerifier {
  private readonly key: Uint8Array;

  constructor(private readonly config: ConfigService) {
    this.key = new TextEncoder().encode(config.getOrThrow('JWT_SECRET'));
  }

  async verify(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.config.getOrThrow('JWT_ISSUER'),
        audience: this.config.getOrThrow('JWT_AUDIENCE'),
        requiredClaims: ['exp'],
      });
      return payload;
    } catch (err) {
      if (err instanceof errors.JOSEError) {
        throw new UnauthorizedException('Invalid token');
      }
      throw err;
    }
  }
}
