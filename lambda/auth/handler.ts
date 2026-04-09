import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { signJwt } from '../shared/jwt';
import { resolvePermissions, json, unauthorized, badRequest } from '../shared/rbac';
import { getItem, putItem, appTable, updateItem } from '../shared/dynamo';
import type { AppUser } from '../shared/types';

const ssm = new SSMClient({});
let googleClientId: string | null = null;
let googleClientSecret: string | null = null;

const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || 'bioliteenergy.com,goalzero.com')
  .split(',')
  .map((d) => d.trim());

function getAllowedRedirectUris(): string[] {
  return (process.env.ALLOWED_REDIRECT_URIS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

async function getGoogleCredentials() {
  if (googleClientId && googleClientSecret) return { googleClientId, googleClientSecret };
  const stage = process.env.STAGE || 'dev';
  const [idResult, secretResult] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: `/{{APP_NAME}}/${stage}/google_client_id`, WithDecryption: false })),
    ssm.send(new GetParameterCommand({ Name: `/{{APP_NAME}}/${stage}/google_client_secret`, WithDecryption: true })),
  ]);
  googleClientId = idResult.Parameter!.Value!;
  googleClientSecret = secretResult.Parameter!.Value!;
  return { googleClientId, googleClientSecret };
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
  } catch {
    return {};
  }
}

async function handleRedirect(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { googleClientId: clientId } = await getGoogleCredentials();
  const redirectUri = event.queryStringParameters?.redirect_uri;

  if (!redirectUri) return badRequest('redirect_uri required');

  const allowed = getAllowedRedirectUris();
  if (allowed.length > 0 && !allowed.includes(redirectUri)) {
    return badRequest('Invalid redirect_uri');
  }

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });

  return json(200, {
    authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    client_id: clientId,
  });
}

async function handleCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const { code, code_verifier, redirect_uri } = body as {
    code?: string;
    code_verifier?: string;
    redirect_uri?: string;
  };

  if (!code || !code_verifier || !redirect_uri) return badRequest('code, code_verifier, and redirect_uri required');

  // Validate redirect_uri against allowlist
  const allowed = getAllowedRedirectUris();
  if (allowed.length > 0 && !allowed.includes(redirect_uri as string)) {
    return badRequest('Invalid redirect_uri');
  }

  const { googleClientId: clientId, googleClientSecret: clientSecret } = await getGoogleCredentials();

  // Exchange code for tokens
  const tokenParams: Record<string, string> = {
    code: code as string,
    client_id: clientId!,
    client_secret: clientSecret!,
    redirect_uri: redirect_uri as string,
    grant_type: 'authorization_code',
  };
  tokenParams.code_verifier = code_verifier as string;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tokenParams),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error('Google token exchange failed:', errorBody);
    return json(400, { error: 'Token exchange failed' });
  }

  const tokens = (await tokenResponse.json()) as {
    id_token: string;
    refresh_token?: string;
    access_token: string;
  };

  // Decode Google ID token (no verification needed; came directly from Google)
  const idPayload = JSON.parse(
    Buffer.from(tokens.id_token.split('.')[1], 'base64').toString(),
  ) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
    hd?: string;
  };

  // Gate 1: domain check
  if (!idPayload.hd || !ALLOWED_DOMAINS.includes(idPayload.hd)) {
    return json(403, { error: 'Access restricted to authorized domain accounts' });
  }

  // Gate 2: allowlist check
  const tableName = appTable('User');
  const appUser = await getItem<AppUser>(tableName, { email: idPayload.email });
  if (!appUser || appUser.status !== 'active') {
    return json(403, { error: 'You have not been invited to this application. Contact an admin.' });
  }

  // Update user record with Google info and last login
  await updateItem(
    tableName,
    { email: idPayload.email },
    'SET #name = :name, googleSub = :sub, lastLoginAt = :now',
    { ':name': idPayload.name, ':sub': idPayload.sub, ':now': new Date().toISOString() },
    { '#name': 'name' },
  );

  // Resolve permissions and issue app JWT
  const permissions = resolvePermissions(appUser.role, appUser.permissionOverrides);
  const appToken = await signJwt({
    sub: idPayload.sub,
    email: idPayload.email,
    name: idPayload.name,
    role: appUser.role,
    permissions,
  });

  return json(200, {
    token: appToken,
    refresh_token: tokens.refresh_token || null,
    user: {
      email: idPayload.email,
      name: idPayload.name,
      picture: idPayload.picture,
      role: appUser.role,
      permissions,
    },
  });
}

async function handleRefresh(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const refreshToken = body.refresh_token as string | undefined;
  if (!refreshToken) return badRequest('refresh_token required');

  const { googleClientId: clientId, googleClientSecret: clientSecret } = await getGoogleCredentials();

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    return json(401, { error: 'Refresh failed; please login again' });
  }

  const tokens = (await tokenResponse.json()) as { id_token: string };
  const idPayload = JSON.parse(
    Buffer.from(tokens.id_token.split('.')[1], 'base64').toString(),
  ) as { sub: string; email: string; name: string };

  // Re-fetch user record (role may have changed)
  const appUser = await getItem<AppUser>(appTable('User'), { email: idPayload.email });
  if (!appUser || appUser.status !== 'active') {
    return json(403, { error: 'Account disabled' });
  }

  const permissions = resolvePermissions(appUser.role, appUser.permissionOverrides);
  const appToken = await signJwt({
    sub: idPayload.sub,
    email: idPayload.email,
    name: idPayload.name,
    role: appUser.role,
    permissions,
  });

  return json(200, { token: appToken });
}

async function handleMe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { authenticateRequest } = await import('../shared/rbac');
  const user = await authenticateRequest(event);
  if (!user) return unauthorized();

  return json(200, {
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
  });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return json(204, '');
  }

  const path = event.rawPath;
  const method = event.requestContext.http.method;

  if (path === '/auth/google/redirect' && method === 'GET') return handleRedirect(event);
  if (path === '/auth/google/callback' && method === 'POST') return handleCallback(event);
  if (path === '/auth/refresh' && method === 'POST') return handleRefresh(event);
  if (path === '/auth/me' && method === 'GET') return handleMe(event);

  return json(404, { error: 'Not found' });
}
