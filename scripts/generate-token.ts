import 'dotenv/config';
import { config } from 'dotenv';
import { SignJWT } from 'jose';

config({ quiet: true });

const args = new Set(process.argv.slice(2));
const secret = args.has('--bad-signature')
  ? 'wrong-secret'
  : process.env.JWT_SECRET;

const jwt = await new SignJWT({
  sub: 'integration-client-1',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(process.env.JWT_ISSUER!)
  .setAudience(
    args.has('--wrong-aud') ? 'someone-else' : process.env.JWT_AUDIENCE!,
  )
  .setIssuedAt()
  .setExpirationTime(args.has('--expired') ? '-1m' : '5m')
  .sign(new TextEncoder().encode(secret));

console.log(jwt);
