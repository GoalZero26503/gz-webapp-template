# Authentication and Authorization

## Overview

The app uses Google OAuth 2.0 with PKCE for authentication, issues its own JWTs for session management, and enforces role-based access control (RBAC) with a user allowlist stored in DynamoDB.

## PKCE Authentication Flow

The full login sequence:

1. **User clicks "Sign in with Google"** on the Login page
2. **Frontend generates PKCE pair**: Creates a random code verifier, hashes it to a code challenge (S256), stores verifier in `sessionStorage`
3. **Frontend calls `GET /auth/google/redirect`**: Passes `redirect_uri` as a query parameter. Lambda returns the Google OAuth authorization URL and the app's client ID.
4. **Frontend appends PKCE challenge**: Adds `code_challenge` and `code_challenge_method=S256` to the Google URL
5. **Browser redirects to Google**: User authenticates with their Google account
6. **Google redirects back** to `{origin}/auth/callback` with an authorization `code`
7. **AuthCallback page calls `POST /auth/google/callback`**: Sends `code`, `code_verifier`, and `redirect_uri`
8. **Lambda exchanges code for tokens**: Calls Google's token endpoint with the code, client secret, and code verifier
9. **Lambda validates the user**:
   - **Domain check**: Verifies the Google `hd` (hosted domain) claim is in `ALLOWED_DOMAINS`
   - **Allowlist check**: Looks up the user's email in the AppUser DynamoDB table; requires `status: 'active'`
10. **Lambda issues app JWT**: Signs a JWT with the user's info, role, and resolved permissions
11. **Frontend stores auth**: Saves JWT and user info in `localStorage` under the app's storage key

## JWT Payload

```typescript
interface AppJwtPayload {
  sub: string;          // Google subject ID
  email: string;        // User's email
  name: string;         // Display name from Google
  role: AppRole;        // 'admin' | 'user'
  permissions: Permission[];  // Resolved permission list
  iat: number;          // Issued at (Unix timestamp)
  exp: number;          // Expires at (Unix timestamp)
}
```

- Token lifetime: 7 days (604800 seconds)
- Algorithm: HMAC-SHA256
- Secret: stored in SSM Parameter Store at `/{app-name}/{stage}/jwt_secret`
- The secret is cached in the Lambda's module scope after first fetch

## RBAC: Roles and Permissions

### Roles

| Role | Hierarchy Level | Description |
|------|----------------|-------------|
| `user` | 0 | Base role; no portal permissions by default |
| `admin` | 1 | Full portal access; can manage users |

Roles are defined in `lambda/shared/types.ts` in the `APP_ROLES` array and `ROLE_HIERARCHY` object.

### Permissions

| Permission | Description | Granted to |
|-----------|-------------|------------|
| `portal:user:read` | View the user list | admin |
| `portal:user:write` | Change user roles | admin |
| `portal:user:invite` | Invite new users | admin |
| `portal:user:delete` | Remove users | admin |

Permissions are defined in the `PERMISSIONS` object and mapped to roles in `ROLE_PERMISSIONS`, both in `lambda/shared/types.ts`.

### Permission Resolution

Permissions are resolved at login time by `resolvePermissions()` in `lambda/shared/rbac.ts`:

1. Start with the base permissions for the user's role (`ROLE_PERMISSIONS[role]`)
2. Apply any `permissionOverrides.grant` (add specific permissions)
3. Apply any `permissionOverrides.revoke` (remove specific permissions)
4. Return the final permission list

This allows per-user overrides without changing their role.

### Role Assignment Rules

- Users can only assign roles below their own hierarchy level
- Users cannot modify someone at or above their own level
- Users cannot change their own role
- Users cannot delete themselves

These rules are enforced in `lambda/users/handler.ts` via the `canAssignRole()` helper.

## Domain Restriction

The `ALLOWED_DOMAINS` environment variable (set in the CDK stack) contains a comma-separated list of allowed Google Workspace domains. Default: `bioliteenergy.com,goalzero.com`.

During login, the Lambda checks the `hd` (hosted domain) claim from the Google ID token. If the domain is not in the allowed list, login is rejected with a 403.

## User Allowlist

Authentication requires the user to exist in the AppUser DynamoDB table with `status: 'active'`. The table schema:

```typescript
interface AppUser {
  email: string;           // Partition key
  name?: string;           // Set after first login
  role: AppRole;           // 'admin' | 'user'
  status: 'active' | 'disabled';
  invitedBy: string;       // Email of inviter, or 'system' for seed admin
  invitedAt: string;       // ISO timestamp
  googleSub?: string;      // Set after first login
  lastLoginAt?: string;    // Updated on each login
  permissionOverrides?: PermissionOverride;
}
```

The seed admin is created automatically by a CDK Custom Resource on first stack deployment.

New users are invited via `POST /portal/users` by an admin with `portal:user:invite` permission.

## SSM Parameter Paths

| Parameter | Path | Type | Description |
|-----------|------|------|-------------|
| Google Client ID | `/{app-name}/{stage}/google_client_id` | String | OAuth client ID from Google Cloud Console |
| Google Client Secret | `/{app-name}/{stage}/google_client_secret` | SecureString | OAuth client secret (encrypted) |
| JWT Secret | `/{app-name}/{stage}/jwt_secret` | SecureString | HMAC key for signing JWTs |

These must be created manually before the first deploy. See `docs/setup.md` for the exact commands.

## Token Lifecycle

1. **Login**: JWT issued with 7-day expiry, stored in `localStorage`
2. **API requests**: `apiFetch()` in `webapp/src/lib/api.ts` attaches `Authorization: Bearer {token}` header
3. **401 response**: `apiFetch()` automatically attempts a token refresh using the stored Google refresh token
4. **Successful refresh**: New JWT stored, original request retried
5. **Failed refresh**: Auth cleared from localStorage, user redirected to `/login`
6. **Token expiry check**: `isAuthenticated()` checks `exp` claim before rendering protected routes

## Frontend Auth Functions

All in `webapp/src/lib/auth.ts`:

| Function | Description |
|----------|-------------|
| `startGoogleLogin()` | Generates PKCE pair, fetches auth URL, redirects to Google |
| `exchangeCode(code)` | Sends auth code + verifier to callback endpoint, stores result |
| `refreshToken()` | Uses stored Google refresh token to get a new app JWT |
| `isAuthenticated()` | Checks localStorage for valid (non-expired) token |
| `getToken()` | Returns the current JWT string |
| `getUser()` | Returns the stored AuthUser object |
| `getStoredAuth()` | Returns the full StoredAuth object |
| `clearAuth()` | Removes auth from localStorage |

## Adding New Roles

1. **Lambda types** (source of truth): Edit `lambda/shared/types.ts`:
   - Add the role name to `APP_ROLES`
   - Add to `AppRole` type (derived automatically from `APP_ROLES`)
   - Add permissions mapping in `ROLE_PERMISSIONS`
   - Set hierarchy level in `ROLE_HIERARCHY`

2. **Webapp types** (mirror): Edit `webapp/src/lib/types.ts`:
   - Update the `AppRole` type union
   - Add any new `Permission` values

3. **CDK** (if new permissions need new SSM params or resources): Update the CDK stack as needed.

## Adding New Permissions

1. Add the permission key and description to the `PERMISSIONS` object in `lambda/shared/types.ts`
2. The `Permission` type is derived automatically from the keys of `PERMISSIONS`
3. Add the permission to the appropriate roles in `ROLE_PERMISSIONS`
4. Mirror the new permission in `webapp/src/lib/types.ts`
5. Use `hasPermission(user, 'your:new:permission')` in Lambda handlers
6. Use `hasPermission('your:new:permission')` from `webapp/src/lib/permissions.ts` in the frontend
