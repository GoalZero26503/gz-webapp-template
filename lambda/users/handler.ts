import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { authenticateRequest, hasPermission, canAssignRole, json, unauthorized, forbidden, badRequest, notFound } from '../shared/rbac';
import { getItem, putItem, scanItems, updateItem, deleteItem, appTable } from '../shared/dynamo';
import type { AppUser, AppRole } from '../shared/types';
import { APP_ROLES, ROLE_HIERARCHY } from '../shared/types';

const TABLE = appTable('User');

async function listUsers(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const user = await authenticateRequest(event);
  if (!user) return unauthorized();
  if (!hasPermission(user, 'portal:user:read')) return forbidden();

  const { items } = await scanItems<AppUser>(TABLE, { limit: 200 });

  return json(200, {
    users: items.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      invitedBy: u.invitedBy,
      invitedAt: u.invitedAt,
      lastLoginAt: u.lastLoginAt,
    })),
  });
}

async function inviteUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const user = await authenticateRequest(event);
  if (!user) return unauthorized();
  if (!hasPermission(user, 'portal:user:invite')) return forbidden();

  const body = JSON.parse(event.body || '{}') as { email?: string; role?: AppRole };
  if (!body.email) return badRequest('email required');

  const email = body.email.toLowerCase().trim();
  if (!email.includes('@')) return badRequest('Invalid email address');

  const role = body.role || 'user';
  if (!APP_ROLES.includes(role)) return badRequest(`Invalid role: ${role}`);
  if (!canAssignRole(user.role, role)) {
    return forbidden(`Cannot assign role "${role}"; exceeds your own role level`);
  }

  // Check if user already exists
  const existing = await getItem<AppUser>(TABLE, { email });
  if (existing) return badRequest('User already exists');

  const newUser: AppUser = {
    email,
    role,
    invitedBy: user.email,
    invitedAt: new Date().toISOString(),
    status: 'active',
  };

  await putItem(TABLE, newUser as unknown as Record<string, unknown>);
  return json(201, { user: newUser });
}

async function setUserRole(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const user = await authenticateRequest(event);
  if (!user) return unauthorized();
  if (!hasPermission(user, 'portal:user:write')) return forbidden();

  const targetEmail = decodeURIComponent(event.pathParameters?.email || '');
  if (!targetEmail) return badRequest('email required');
  if (targetEmail === user.email) return badRequest('Cannot change your own role');

  const body = JSON.parse(event.body || '{}') as { role?: AppRole };
  if (!body.role || !APP_ROLES.includes(body.role)) return badRequest('Valid role required');

  const target = await getItem<AppUser>(TABLE, { email: targetEmail });
  if (!target) return notFound('User not found');

  // Check hierarchy: can't promote above own level, can't modify someone at or above own level
  if (!canAssignRole(user.role, body.role)) {
    return forbidden('Cannot assign a role at or above your own level');
  }
  if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[user.role]) {
    return forbidden('Cannot modify a user at or above your own role level');
  }

  await updateItem(TABLE, { email: targetEmail }, 'SET #role = :role', { ':role': body.role }, { '#role': 'role' });

  return json(200, { email: targetEmail, role: body.role });
}

async function removeUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const user = await authenticateRequest(event);
  if (!user) return unauthorized();
  if (!hasPermission(user, 'portal:user:delete')) return forbidden();

  const targetEmail = decodeURIComponent(event.pathParameters?.email || '');
  if (!targetEmail) return badRequest('email required');
  if (targetEmail === user.email) return badRequest('Cannot delete yourself');

  const target = await getItem<AppUser>(TABLE, { email: targetEmail });
  if (!target) return notFound('User not found');

  if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[user.role]) {
    return forbidden('Cannot delete a user at or above your own role level');
  }

  await deleteItem(TABLE, { email: targetEmail });

  return json(200, { email: targetEmail, deleted: true });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') return json(204, '');

  const path = event.rawPath;
  const method = event.requestContext.http.method;

  if (path === '/portal/users' && method === 'GET') return listUsers(event);
  if (path === '/portal/users' && method === 'POST') return inviteUser(event);

  const roleMatch = path.match(/^\/portal\/users\/([^/]+)\/role$/);
  if (roleMatch && method === 'PUT') return setUserRole(event);

  const deleteMatch = path.match(/^\/portal\/users\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') return removeUser(event);

  return json(404, { error: 'Not found' });
}
