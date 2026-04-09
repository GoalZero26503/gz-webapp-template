# Goal Zero Internal Webapp Template

A batteries-included template for building internal webapps at Goal Zero. Designed for hardware and systems engineers who use Claude Code as their primary development tool.

## Quick Start

1. **Create your repo**: Click **"Use this template"** on the [GitHub repo page](https://github.com/GoalZero26503/gz-webapp-template)
2. **Clone and open**: Clone your new repo locally and open it in Claude Code
3. **Run setup**: Type `/gz:webapp:setup` and follow the interactive wizard

That's it. The wizard handles naming, configuration, dependency installation, and validation.

## What You Get

- **Google OAuth with PKCE**: Secure authentication restricted to company email domains
- **Role-based access control (RBAC)**: Admin and user roles with granular permissions
- **User management portal**: Invite users, assign roles, manage access
- **Dark theme with GZ branding**: Polished UI with Goal Zero color tokens and typography
- **AWS CDK infrastructure**: One-command deploy of API Gateway, Lambda, DynamoDB, S3, CloudFront
- **S3 + CloudFront hosting**: Fast, global static site delivery with HTTPS
- **Full Claude Code agent tooling**: Setup wizard, deploy command, feature scaffolding, status checks

## Available Commands

| Command | Description |
|---------|-------------|
| `/gz:webapp:setup` | Interactive setup wizard; run once after creating your repo from the template |
| `/gz:webapp:deploy` | Build and deploy to an AWS environment (dev, prod, etc.) |
| `/gz:webapp:scaffold` | Scaffold new pages, API routes, or DynamoDB tables from a description |
| `/gz:webapp:status` | Show project configuration, placeholder status, and deployment info |

## Project Structure

```
├── webapp/          React SPA (Vite + TypeScript + Tailwind)
├── lambda/          API Lambda handlers (TypeScript, bundled by CDK)
├── cdk/             AWS CDK infrastructure (TypeScript)
├── docs/            Human-readable documentation
├── scripts/         Deployment and utility scripts
└── .agents/docs/    Agent reference documentation
```

- **webapp/**: The frontend single-page application. Builds to static files deployed to S3.
- **lambda/**: Backend API handlers. Each subdirectory is a Lambda function with its own handler. CDK bundles these automatically with esbuild.
- **cdk/**: Infrastructure as code. Defines all AWS resources (DynamoDB tables, Lambda functions, API Gateway, S3 bucket, CloudFront distribution).

## Pulling Template Updates

If the base template gets improvements, you can pull them into your project:

```bash
# One-time: add the template as a remote (the setup wizard does this automatically)
git remote add template https://github.com/GoalZero26503/gz-webapp-template.git

# Pull updates
git fetch template
git merge template/main --allow-unrelated-histories
```

Resolve any merge conflicts, then test and deploy.

## Prerequisites

- **Node.js 20+**: [nodejs.org](https://nodejs.org/)
- **AWS CLI v2**: [aws.amazon.com/cli](https://aws.amazon.com/cli/)
- **CDK CLI**: `npm install -g aws-cdk`
- **Claude Code**: [claude.ai/code](https://claude.ai/code)
- **Google Cloud Console access**: For creating OAuth credentials (the setup wizard walks you through this)

## Documentation

- **[docs/setup.md](docs/setup.md)**: Step-by-step setup guide
- **[docs/adding-features.md](docs/adding-features.md)**: How to build features with Claude Code
- **[docs/environments.md](docs/environments.md)**: Environment and deployment guide
- **[.agents/docs/](/.agents/docs/)**: Technical reference for agents (auth, API, deployment, conventions)
