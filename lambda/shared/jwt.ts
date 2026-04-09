import { createHmac, timingSafeEqual } from 'crypto';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { AppJwtPayload } from './types';

const ssm = new SSMClient({});
let cachedSecret: string | null = null;

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const stage = process.env.STAGE || 'dev';
  const result = await ssm.send(
    new GetParameterCommand({
      Name: `/{{APP_NAME}}/${stage}/jwt_secret`,
      WithDecryption: true,
    }),
  );
  cachedSecret = result.Parameter!.Value!;
  return cachedSecret;
}

export async function signJwt(payload: Omit<AppJwtPayload, 'iat' | 'exp'>): Promise<string> {
  const secret = await getSecret();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AppJwtPayload = {
    ...payload,
    iat: now,
    exp: now + 604800, // 7 days
  };

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

export async function verifyJwt(token: string): Promise<AppJwtPayload> {
  const secret = await getSecret();
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [header, body, signature] = parts;
  const expectedSig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid signature');
  }

  const payload: AppJwtPayload = JSON.parse(base64UrlDecode(body));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');

  return payload;
}
