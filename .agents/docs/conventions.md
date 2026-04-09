# Code Conventions

## Naming

| Context | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `user-management.tsx`, `handler.ts` |
| React components | PascalCase (named export) | `export function UserManagement()` |
| Functions / variables | camelCase | `getStoredAuth()`, `const appUser` |
| Types / interfaces | PascalCase | `AppUser`, `Permission` |
| Constants | UPPER_SNAKE_CASE | `APP_ROLES`, `ROLE_HIERARCHY` |
| DynamoDB table names | `{stage}{AppPascal}{TableName}` | `devFleetTrackerUser` |
| Lambda function names | `{stage}-{app-name}-{handler}` | `dev-fleet-tracker-auth` |
| S3 bucket names | `{stage}-{app-name}-{purpose}` | `dev-fleet-tracker-webapp` |
| SSM parameter paths | `/{app-name}/{stage}/{param}` | `/fleet-tracker/dev/jwt_secret` |

## Lambda Handlers

### Routing Pattern

Each Lambda handler exports a single `handler` function that routes internally:

```typescript
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') return json(204, '');

  const path = event.rawPath;
  const method = event.requestContext.http.method;

  if (path === '/api/items' && method === 'GET') return listItems(event);
  if (path === '/api/items' && method === 'POST') return createItem(event);

  return json(404, { error: 'Not found' });
}
```

### Response Pattern

Always return via the `json()` helper from `lambda/shared/rbac.ts`. Never throw exceptions for HTTP errors.

```typescript
// Correct
return json(400, { error: 'email required' });

// Incorrect - never do this
throw new Error('email required');
```

Available response helpers:
- `json(statusCode, body)`: General purpose
- `badRequest(message)`: 400
- `unauthorized(message?)`: 401
- `forbidden(message?)`: 403
- `notFound(message?)`: 404

### Authentication Pattern

For routes that require auth:

```typescript
async function handleProtectedRoute(event: APIGatewayProxyEventV2) {
  const user = await authenticateRequest(event);
  if (!user) return unauthorized();
  if (!hasPermission(user, 'some:permission')) return forbidden();

  // ... handler logic
}
```

### Body Parsing

Parse request bodies safely:

```typescript
const body = JSON.parse(event.body || '{}') as { email?: string };
if (!body.email) return badRequest('email required');
```

## DynamoDB

### Table Names

Use the `appTable()` helper from `lambda/shared/dynamo.ts`:

```typescript
const TABLE = appTable('Device');
// Resolves to: {stage}{AppPascal}Device (e.g. devFleetTrackerDevice)
```

### CDK Table Definitions

New tables should always use:
- `billingMode: dynamodb.BillingMode.PAY_PER_REQUEST` (on-demand, no capacity planning)
- `removalPolicy: cdk.RemovalPolicy.RETAIN` (prevent accidental data loss)
- `pointInTimeRecovery: true` (enable point-in-time recovery backups)

```typescript
const deviceTable = new dynamodb.Table(this, 'DeviceTable', {
  tableName: `${stage}${appPascal}Device`,
  partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  pointInTimeRecovery: true,
});
```

### DynamoDB Helpers

Available from `lambda/shared/dynamo.ts`:
- `getItem<T>(table, key)`: Get a single item
- `putItem(table, item)`: Put an item (create or overwrite)
- `queryItems<T>(table, keyCondition, values, options?)`: Query with key condition
- `scanItems<T>(table, options?)`: Scan (use sparingly)
- `updateItem(table, key, expression, values, names?)`: Update specific attributes
- `deleteItem(table, key)`: Delete an item

## AWS SDK

### Client Instantiation

Instantiate AWS SDK clients once at module scope. This allows Lambda to reuse connections across warm invocations:

```typescript
// Module scope (top of file)
const ssm = new SSMClient({});
let cachedValue: string | null = null;

// Inside handler
async function getValue() {
  if (cachedValue) return cachedValue;
  // ... fetch and cache
}
```

### SSM Parameter Caching

SSM values are cached in module-scope variables. On a warm Lambda, the cached value is reused without an SSM call. On a cold start, the value is fetched once and cached.

## Frontend

### Page Structure

Pages live in `webapp/src/pages/`. Each page is a named export:

```typescript
export function DeviceList() {
  return (
    <div className="page-padding">
      <h1 className="text-lg font-semibold text-text-primary mb-6">Devices</h1>
      {/* page content */}
    </div>
  );
}
```

### Component Organization

- `webapp/src/pages/`: Page-level components (one per route)
- `webapp/src/components/`: Shared components (Topbar, buttons, modals, etc.)
- `webapp/src/lib/`: Utilities, API client, auth helpers, types

### CSS and Styling

The app uses Tailwind CSS v4 for layout and spacing, with CSS custom properties for brand-specific tokens.

**Tailwind**: Use for margins, padding, flex/grid, font sizes, borders, etc.

**CSS custom properties** (defined in `webapp/src/index.css :root`): Use for colors, radii, fonts, and animations. Reference them with Tailwind's arbitrary value syntax or in custom CSS.

Brand color tokens:
- `--gz-green`: Primary brand green (#bfd22b)
- `--gz-green-dim`: Subtle green background
- `--gz-green-muted`: Darker green for secondary elements
- `--bg-root`, `--bg-primary`, `--bg-card`, `--bg-elevated`: Background layers
- `--text-primary`, `--text-secondary`, `--text-tertiary`: Text hierarchy
- `--border`, `--border-subtle`, `--border-focus`: Border styles

## Imports

### Import Order

Group imports in this order, separated by blank lines:

1. External packages (`react`, `aws-cdk-lib`, etc.)
2. Internal modules (`../shared/rbac`, `./lib/api`, etc.)

### Type-Only Imports

Use `import type` for imports used only as types:

```typescript
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AppUser, AppRole } from '../shared/types';
```

This helps bundlers tree-shake and makes intent clear.

## Environment Detection

### Frontend

Derive the current environment from the hostname:

```typescript
const hostname = window.location.hostname;
// localhost -> dev
// *-dev.goalzeroapp.com -> dev
// *-test.goalzeroapp.com -> test
// *.goalzeroapp.com (no env suffix) -> prod
```

The `VITE_API_URL` is baked in at build time, so each environment's build points to the correct API.

### Backend (Lambda)

Use the `STAGE` environment variable set by CDK:

```typescript
const stage = process.env.STAGE || 'dev';
```
