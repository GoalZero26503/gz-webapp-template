# {{APP_DISPLAY_NAME}}

@.agents/docs/structure.md
@.agents/docs/auth.md
@.agents/docs/api.md
@.agents/docs/deploy.md
@.agents/docs/conventions.md
@.agents/docs/aws-namespace.md

## Overview

This is a Goal Zero internal webapp built from the [gz-webapp-template](https://github.com/GoalZero26503/gz-webapp-template). It uses React + Vite + Tailwind for the frontend, TypeScript Lambda functions for the API, and AWS CDK for infrastructure.

## Project Structure

- `webapp/` -- React SPA (Vite + TypeScript + Tailwind)
- `lambda/` -- API Lambda handlers (TypeScript, bundled by CDK)
- `cdk/` -- AWS CDK infrastructure (TypeScript)
- `docs/` -- Human-readable documentation
- `.agents/docs/` -- Agent reference documentation

## Available Commands

| Command | Description |
|---------|-------------|
| `/gz:webapp:setup` | Interactive setup wizard (run once after cloning template) |
| `/gz:webapp:deploy` | Deploy to an AWS environment |
| `/gz:webapp:scaffold` | Scaffold new pages, API routes, or DynamoDB tables |
| `/gz:webapp:status` | Show project config and deployment status |

## Key Rules

1. Lambda handlers return responses via `json()` helper from `lambda/shared/rbac.ts`. Never throw for HTTP errors.
2. New pages go in `webapp/src/pages/` and must be added to the Routes in `App.tsx`.
3. New API routes need: Lambda handler in `lambda/`, CDK route in `cdk/lib/app-stack.ts`, and client method in `webapp/src/lib/api.ts`.
4. DynamoDB table names use the `appTable()` helper from `lambda/shared/dynamo.ts`.
5. Secrets go in SSM Parameter Store at `/gzweb/{{APP_NAME}}/{stage}/{param}`. Never hardcode secrets.
6. CSS uses Tailwind classes for layout/spacing and CSS custom properties (in index.css) for brand colors.
7. Keep `.agents/docs/` and `docs/` up to date when making structural changes.
8. **All AWS resources MUST use the `gzweb-` namespace prefix** (e.g., `gzweb-{stage}-{{APP_NAME}}-webapp`). All SSM parameters MUST use the `/gzweb/{{APP_NAME}}/{stage}/*` prefix. This namespace is how IAM scopes developer access; any resource without the prefix will be inaccessible to webapp developers. See `.agents/docs/aws-namespace.md`.
