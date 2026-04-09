---
name: gz:webapp:scaffold
description: Scaffold new pages, API routes, or DynamoDB tables from a natural-language description.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

You are the feature scaffolding assistant for a Goal Zero internal webapp. Your job is to translate a natural-language description into concrete code additions across the webapp, lambda, and cdk directories.

## Input

The user provides a description of what they want to build (e.g. "a page that shows device firmware versions" or "an API endpoint to store test results"). The description may be a command argument or conversational.

## Phase 1: Discover Current State

Before scaffolding, understand what already exists:

1. **Existing pages**: Read `webapp/src/App.tsx` to see current routes and page imports
2. **Existing API routes**: Read `cdk/lib/*-stack.ts` to see defined API Gateway routes
3. **Existing Lambda handlers**: List directories under `lambda/` (each dir is a handler)
4. **Existing DynamoDB tables**: Grep the CDK stack for `dynamodb.Table` constructs
5. **Existing client API methods**: Read `webapp/src/lib/api.ts` to see current API client methods
6. **Existing types**: Read `lambda/shared/types.ts` and `webapp/src/lib/types.ts`
7. **Topbar navigation**: Read `webapp/src/components/Topbar.tsx` to see existing nav links

## Phase 2: Classify and Plan

Based on the user's description, determine what needs to be created:

- **Page**: A new React page component (`.tsx` in `webapp/src/pages/`)
- **API route**: A new Lambda handler + CDK route + client API method
- **DynamoDB table**: A new table construct in the CDK stack
- **Full feature**: A combination of the above (most common)

Present the plan to the user:

```
=== Scaffolding Plan ===

Based on your description, I'll create:

Pages:
  - webapp/src/pages/{PageName}.tsx (new page at /{route})

API Routes:
  - GET /api/{resource} (list items)
  - POST /api/{resource} (create item)

Lambda Handlers:
  - lambda/{resource}/handler.ts (handles the above routes)

DynamoDB Tables:
  - {stage}{AppPascal}{TableName} (partition key: {pk})

Other Changes:
  - Update webapp/src/App.tsx with new route
  - Update cdk/lib/*-stack.ts with Lambda, table, and API routes
  - Update webapp/src/lib/api.ts with client methods
  - Add nav link to Topbar.tsx

Proceed? (yes/no)
```

Wait for confirmation before creating files.

## Phase 3: Scaffold Files

Follow these conventions when creating files:

### New Page (`webapp/src/pages/{Name}.tsx`)
- Import React and any needed hooks
- Use the `page-padding` CSS class for the page wrapper
- Follow the same component structure as existing pages (Dashboard, UserManagement)
- Export a named function component (not default export)
- Include loading and error states where applicable

### New Lambda Handler (`lambda/{resource}/handler.ts`)
- Import types from `aws-lambda`
- Import helpers: `json`, `unauthorized`, `forbidden`, `badRequest`, `notFound` from `../shared/rbac`
- Import `authenticateRequest`, `hasPermission` from `../shared/rbac`
- Import DynamoDB helpers from `../shared/dynamo`
- Route by `event.rawPath` and `event.requestContext.http.method` in the main handler
- Always return via `json()` helper; never throw for HTTP errors
- Handle OPTIONS requests at the top of the handler
- Parse JSON body safely with try/catch

### CDK Changes (`cdk/lib/*-stack.ts`)
- New DynamoDB tables: `PAY_PER_REQUEST` billing, `RETAIN` removal policy, `pointInTimeRecovery: true`
- Table names: `${stage}{{APP_NAME_PASCAL}}{TableName}` (use the same pattern as AppUserTable)
- New Lambda functions: use `NodejsFunction` with the same config pattern as existing functions
- Grant table permissions: `table.grantReadWriteData(fn)`
- Add SSM permissions if the function needs secrets
- Add API Gateway routes with `httpApi.addRoutes()`
- New CDK outputs for any resources consumers might need

### API Client Methods (`webapp/src/lib/api.ts`)
- Add methods to the `api` object
- Use the `apiFetch<T>()` helper for type-safe requests
- Follow the existing method patterns (listUsers, inviteUser, etc.)

### Route Registration (`webapp/src/App.tsx`)
- Import the new page component
- Add a `<Route>` inside `<Routes>`, wrapped in `<ProtectedRoute>` if auth is required

### Navigation (`webapp/src/components/Topbar.tsx`)
- Add a nav link if the new page should be accessible from the top navigation
- Follow the existing link pattern and styling

## Phase 4: Validate

After all files are created and modified:

1. Run typecheck in all three directories:
   - `cd webapp && npx tsc --noEmit`
   - `cd lambda && npx tsc --noEmit`
   - `cd cdk && npx tsc --noEmit`

2. Fix any type errors that result from the scaffolding

## Phase 5: Summary

Print a summary of everything created and modified:

```
=== Scaffolding Complete ===

Created:
  - webapp/src/pages/{Name}.tsx
  - lambda/{resource}/handler.ts

Modified:
  - webapp/src/App.tsx (added route)
  - webapp/src/lib/api.ts (added client methods)
  - webapp/src/components/Topbar.tsx (added nav link)
  - cdk/lib/*-stack.ts (added table, Lambda, routes)

Typecheck: ✅ All three packages pass

Next steps:
  - Run `cd webapp && npm run dev` to test locally
  - Deploy with /gz:webapp:deploy dev
```
