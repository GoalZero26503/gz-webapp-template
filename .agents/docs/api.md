# API Reference

## Base URL

The API base URL comes from the `VITE_API_URL` environment variable, loaded from `.env.{stage}` at build time. During local development, Vite's proxy forwards API paths to the configured backend.

## Authentication

Most routes require a valid JWT in the `Authorization` header:

```
Authorization: Bearer {jwt_token}
```

Auth routes (`/auth/*`) do not require a token; they issue tokens.

## Response Format

All responses are JSON with appropriate HTTP status codes. Error responses follow this shape:

```json
{ "error": "Human-readable error message" }
```

Success responses vary by endpoint but are always JSON objects.

## Routes

### Auth Routes (Unauthenticated)

#### `GET /auth/google/redirect`

Start the Google OAuth flow. Returns the authorization URL for the frontend to redirect to.

**Query Parameters:**
- `redirect_uri` (required): The callback URL (e.g. `http://localhost:5174/auth/callback`)

**Response (200):**
```json
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "client_id": "123456.apps.googleusercontent.com"
}
```

**Errors:**
- `400`: `redirect_uri required` or `Invalid redirect_uri`

---

#### `POST /auth/google/callback`

Exchange an authorization code for an app JWT.

**Request Body:**
```json
{
  "code": "authorization_code_from_google",
  "code_verifier": "pkce_verifier_string",
  "redirect_uri": "http://localhost:5174/auth/callback"
}
```

**Response (200):**
```json
{
  "token": "eyJ...",
  "refresh_token": "1//...",
  "user": {
    "email": "user@goalzero.com",
    "name": "Jane Smith",
    "picture": "https://...",
    "role": "admin",
    "permissions": ["portal:user:read", "portal:user:write", "portal:user:invite", "portal:user:delete"]
  }
}
```

**Errors:**
- `400`: `code and redirect_uri required`, `Token exchange failed`
- `403`: `Access restricted to authorized domain accounts`, `You have not been invited to this application. Contact an admin.`

---

#### `POST /auth/refresh`

Refresh the app JWT using a Google refresh token.

**Request Body:**
```json
{
  "refresh_token": "1//..."
}
```

**Response (200):**
```json
{
  "token": "eyJ..."
}
```

**Errors:**
- `400`: `refresh_token required`
- `401`: `Refresh failed; please login again`
- `403`: `Account disabled`

---

#### `GET /auth/me`

Get the current user's info from their JWT. Requires authentication.

**Response (200):**
```json
{
  "email": "user@goalzero.com",
  "name": "Jane Smith",
  "role": "admin",
  "permissions": ["portal:user:read", "portal:user:write", "portal:user:invite", "portal:user:delete"]
}
```

**Errors:**
- `401`: `Authentication required`

---

### User Management Routes (Authenticated)

All user management routes require a valid JWT and appropriate permissions.

#### `GET /portal/users`

List all users. Requires `portal:user:read` permission.

**Response (200):**
```json
{
  "users": [
    {
      "email": "admin@goalzero.com",
      "name": "Jane Smith",
      "role": "admin",
      "status": "active",
      "invitedBy": "system",
      "invitedAt": "2025-01-15T10:30:00.000Z",
      "lastLoginAt": "2025-03-20T14:22:00.000Z"
    }
  ]
}
```

---

#### `POST /portal/users`

Invite a new user. Requires `portal:user:invite` permission.

**Request Body:**
```json
{
  "email": "newuser@goalzero.com",
  "role": "user"
}
```

**Response (201):**
```json
{
  "user": {
    "email": "newuser@goalzero.com",
    "role": "user",
    "invitedBy": "admin@goalzero.com",
    "invitedAt": "2025-03-20T14:30:00.000Z",
    "status": "active"
  }
}
```

**Errors:**
- `400`: `email required`, `Invalid email address`, `Invalid role: {role}`, `User already exists`
- `403`: `Cannot assign role "{role}"; exceeds your own role level`

---

#### `PUT /portal/users/{email}/role`

Change a user's role. Requires `portal:user:write` permission.

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response (200):**
```json
{
  "email": "user@goalzero.com",
  "role": "admin"
}
```

**Errors:**
- `400`: `email required`, `Valid role required`, `Cannot change your own role`
- `403`: `Cannot assign a role at or above your own level`, `Cannot modify a user at or above your own role level`
- `404`: `User not found`

---

#### `DELETE /portal/users/{email}`

Remove a user. Requires `portal:user:delete` permission.

**Response (200):**
```json
{
  "email": "user@goalzero.com",
  "deleted": true
}
```

**Errors:**
- `400`: `email required`, `Cannot delete yourself`
- `403`: `Cannot delete a user at or above your own role level`
- `404`: `User not found`

---

## Frontend API Client

The `api` object in `webapp/src/lib/api.ts` wraps all API calls:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `api.listUsers()` | `GET /portal/users` | Fetch all users |
| `api.inviteUser(email, role)` | `POST /portal/users` | Invite a new user |
| `api.setUserRole(email, role)` | `PUT /portal/users/{email}/role` | Update a user's role |
| `api.removeUser(email)` | `DELETE /portal/users/{email}` | Remove a user |

All methods use the `apiFetch<T>()` helper which:
- Injects the `Authorization: Bearer {token}` header automatically
- On a 401 response, attempts a token refresh and retries the request
- On refresh failure, clears auth and redirects to `/login`
- Parses the JSON response and returns it typed

## Adding a New API Route

1. **Create the Lambda handler**: Add a directory under `lambda/` (e.g. `lambda/devices/handler.ts`). Import helpers from `../shared/rbac` and `../shared/dynamo`. Route by `event.rawPath` and method. Always return via `json()`.

2. **Add CDK resources**: In `cdk/lib/*-stack.ts`:
   - Create a `NodejsFunction` pointing to the new handler
   - Grant DynamoDB table access: `table.grantReadWriteData(fn)`
   - Add SSM permissions if the handler reads secrets
   - Add routes: `httpApi.addRoutes({ path: '/api/devices', methods: [...], integration: new HttpLambdaIntegration(...) })`

3. **Add client method**: In `webapp/src/lib/api.ts`, add methods to the `api` object:
   ```typescript
   listDevices: () =>
     apiFetch<{ devices: Device[] }>('/api/devices'),
   ```

4. **Validate**: Run `npx tsc --noEmit` in all three packages.
