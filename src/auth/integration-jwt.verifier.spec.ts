import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, UnsecuredJWT } from 'jose';
import { IntegrationJwtVerifier } from './integration-jwt.verifier.js';

const env: Record<string, string> = {
  JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef0123456789abcdef0123',
  JWT_ISSUER: 'test-issuer',
  JWT_AUDIENCE: 'test-audience',
};

const config = {
  getOrThrow: (key: string) => env[key],
} as unknown as ConfigService;

type SignOptions = {
  secret?: string;
  alg?: string;
  issuer?: string;
  audience?: string;
  exp?: string | number | null;
};

function sign({
  secret = env.JWT_SECRET,
  alg = 'HS256',
  issuer = env.JWT_ISSUER,
  audience = env.JWT_AUDIENCE,
  exp = '5m',
}: SignOptions = {}): Promise<string> {
  const jwt = new SignJWT({ sub: 'client-1' })
    .setProtectedHeader({ alg })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt();
  if (exp !== null) jwt.setExpirationTime(exp);
  return jwt.sign(new TextEncoder().encode(secret));
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

describe('IntegrationJwtVerifier', () => {
  let verifier: IntegrationJwtVerifier;

  beforeEach(() => {
    verifier = new IntegrationJwtVerifier(config);
  });

  it('accepts a valid token and returns its payload', async () => {
    const payload = await verifier.verify(await sign());

    expect(payload.sub).toBe('client-1');
    expect(payload.iss).toBe(env.JWT_ISSUER);
    expect(payload.aud).toBe(env.JWT_AUDIENCE);
  });

  it('rejects an expired token', async () => {
    const token = await sign({ exp: nowInSeconds() - 60 });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with an invalid signature', async () => {
    const token = await sign({
      secret: 'another-secret-0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each<[string, () => Promise<string>]>([
    ['a wrong issuer', () => sign({ issuer: 'someone-else' })],
    ['a wrong audience', () => sign({ audience: 'someone-else' })],
    ['no exp claim', () => sign({ exp: null })],
    ['a disallowed algorithm (HS512)', () => sign({ alg: 'HS512' })],
    [
      'alg "none"',
      async () =>
        new UnsecuredJWT({ sub: 'client-1' })
          .setIssuer(env.JWT_ISSUER)
          .setAudience(env.JWT_AUDIENCE)
          .setExpirationTime('5m')
          .encode(),
    ],
    ['a malformed value', async () => 'not-a-jwt'],
  ])('rejects a token with %s', async (_, makeToken) => {
    await expect(verifier.verify(await makeToken())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
