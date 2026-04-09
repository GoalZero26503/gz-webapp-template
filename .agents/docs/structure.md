# Project Structure

## Architecture Overview

The project is a three-package monorepo. Each directory is an independent npm package with its own `package.json`, `tsconfig.json`, and `node_modules/`.

```
├── webapp/          Frontend SPA (React + Vite + Tailwind)
├── lambda/          Backend API handlers (TypeScript)
├── cdk/             Infrastructure as Code (AWS CDK)
├── docs/            Human-readable documentation
├── scripts/         Deployment and utility scripts
└── .agents/docs/    Agent reference documentation (this directory)
```

## How the Packages Connect

1. **CDK references Lambda**: CDK uses `NodejsFunction` with `entry: path.join(lambdaDir, '{handler}', 'handler.ts')`. CDK's esbuild bundler compiles each Lambda handler into a self-contained bundle. There is no shared build step between cdk and lambda.

2. **Webapp gets API URL at build time**: The `VITE_API_URL` environment variable is injected at Vite build time from `.env.{stage}`. At runtime, `webapp/src/lib/api.ts` reads `import.meta.env.VITE_API_URL` and prefixes all API calls with it.

3. **No direct code sharing between webapp and lambda**: Types are mirrored manually. The source of truth for types (roles, permissions, interfaces) is `lambda/shared/types.ts`. The webapp has a parallel `webapp/src/lib/types.ts` with the frontend-relevant subset. When modifying types, update both files.

## webapp/ (Frontend)

React SPA built with Vite, TypeScript, and Tailwind CSS v4.

```
webapp/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html                   Entry HTML (includes <title> with app name)
└── src/
    ├── main.tsx                 React root mount with BrowserRouter
    ├── App.tsx                  Route definitions and ProtectedRoute wrapper
    ├── index.css                Global styles, CSS custom properties for brand tokens
    ├── vite-env.d.ts            Vite type declarations
    ├── pages/                   Page components (one per route)
    │   ├── Login.tsx
    │   ├── AuthCallback.tsx
    │   ├── Dashboard.tsx
    │   └── UserManagement.tsx
    ├── components/              Shared UI components
    │   └── Topbar.tsx
    └── lib/                     Utilities and services
        ├── api.ts               API client (apiFetch with auto-refresh)
        ├── auth.ts              Auth flow (PKCE, token storage, refresh)
        ├── types.ts             Frontend type definitions
        └── permissions.ts       Permission check helper
```

Key configuration:
- Dev server runs on port 5174
- Vite proxy forwards `/auth`, `/portal`, and `/api` to the backend during local dev
- Build output goes to `dist-{stage}/` (e.g. `dist-dev/`, `dist-prod/`)
- `__APP_VERSION__` global is injected from package.json version

## lambda/ (Backend)

TypeScript Lambda handlers. Each subdirectory contains a handler function that CDK bundles independently with esbuild.

```
lambda/
├── package.json
├── tsconfig.json
├── auth/
│   └── handler.ts               Google OAuth + JWT issuance
├── users/
│   └── handler.ts               User CRUD (list, invite, role, delete)
└── shared/                      Shared utilities (bundled into each Lambda)
    ├── types.ts                 Source of truth: roles, permissions, interfaces
    ├── rbac.ts                  Auth middleware, permission checks, JSON response helpers
    ├── jwt.ts                   JWT sign/verify using HMAC-SHA256
    └── dynamo.ts                DynamoDB document client and table name helper
```

Key patterns:
- Each handler routes internally by `event.rawPath` and HTTP method
- Responses always go through the `json()` helper (sets CORS headers, stringifies body)
- SSM parameters are cached at module scope (warm Lambda reuse)
- AWS SDK clients are instantiated once at module scope

## cdk/ (Infrastructure)

AWS CDK application written in TypeScript. Defines all cloud resources.

```
cdk/
├── package.json
├── tsconfig.json
├── cdk.json                     CDK app config and default context values
├── bin/
│   └── app.ts                   CDK app entrypoint (reads context, creates stack)
└── lib/
    └── app-stack.ts             Main stack (DDB, Lambda, API GW, S3, CloudFront)
```

Resources created per environment (stage):
- **DynamoDB Table**: `{stage}{AppPascal}User` (user allowlist and profiles)
- **S3 Bucket**: `{stage}-{app-name}-webapp` (static site hosting)
- **Lambda Functions**: `{stage}-{app-name}-auth`, `{stage}-{app-name}-users`
- **API Gateway v2**: HTTP API with CORS, routes for auth and user management
- **CloudFront Distribution**: HTTPS delivery of S3 content, SPA error routing
- **Seed Admin User**: Custom Resource that inserts the first admin on stack creation

CDK context parameters (passed via `--context`):
- `stage`: Environment name (dev, prod, etc.)
- `account`: AWS account ID
- `seedAdminEmail`: Email for the first admin user
- `domainName`: Custom domain (optional)
- `certificateArn`: ACM certificate ARN for custom domain (optional)

## Adding a New Feature End-to-End

A typical feature touches all three packages. Here is the sequence:

1. **Define types**: Add interfaces to `lambda/shared/types.ts`. Mirror relevant types in `webapp/src/lib/types.ts`.

2. **Create DynamoDB table** (if needed): Add a `dynamodb.Table` construct in the CDK stack. Use `appTable()` naming convention, PAY_PER_REQUEST billing, RETAIN removal policy.

3. **Create Lambda handler**: Add a new directory under `lambda/` with a `handler.ts`. Import shared helpers. Route by path and method. Return via `json()`.

4. **Wire CDK**: Add `NodejsFunction` construct, grant table permissions, add API Gateway routes, add `CfnOutput` for any useful values.

5. **Add API client methods**: Add methods to the `api` object in `webapp/src/lib/api.ts` using `apiFetch<T>()`.

6. **Create page component**: Add a `.tsx` file in `webapp/src/pages/`. Use `page-padding` wrapper class.

7. **Register route**: Import the page in `App.tsx`, add a `<Route>` wrapped in `<ProtectedRoute>`.

8. **Add navigation**: Add a link in `Topbar.tsx` if the page should be in the main nav.

9. **Validate**: Run `npx tsc --noEmit` in all three directories.

10. **Deploy**: Use `/gz:webapp:deploy {env}` to deploy changes.
