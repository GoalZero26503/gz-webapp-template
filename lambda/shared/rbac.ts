import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { verifyJwt } from './jwt';
import type { Permission, AppJwtPayload, AppRole, PermissionOverride } from './types';
import { ROLE_PERMISSIONS, ROLE_HIERARCHY } from './types';

export function resolvePermissions(role: AppRole, overrides?: PermissionOverride): Permission[] {
  const base = new Set<Permission>(ROLE_PERMISSIONS[role]);
  if (overrides?.grant) {
    for (const p of overrides.grant) base.add(p);
  }
  if (overrides?.revoke) {
    for (const p of overrides.revoke) base.delete(p);
  }
  return [...base];
}

export function canAssignRole(assignerRole: AppRole, targetRole: AppRole): boolean {
  return ROLE_HIERARCHY[assignerRole] > ROLE_HIERARCHY[targetRole];
}

export async function authenticateRequest(
  event: APIGatewayProxyEventV2,
): Promise<AppJwtPayload | null> {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    return await verifyJwt(token);
  } catch {
    return null;
  }
}

export function hasPermission(user: AppJwtPayload, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

export function forbidden(message = 'Insufficient permissions') {
  return json(403, { error: message });
}

export function unauthorized(message = 'Authentication required') {
  return json(401, { error: message });
}

export function badRequest(message: string) {
  return json(400, { error: message });
}

export function notFound(message = 'Not found') {
  return json(404, { error: message });
}
