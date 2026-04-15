# AWS Namespace: gzweb

## Overview

All resources created by GZ internal webapps are prefixed with `gzweb-`. This namespace allows scoped IAM permissions so webapp developers can deploy and manage their apps without accessing IoT, mobile app, or other production resources in the same AWS account.

## Why This Exists

GZ AWS accounts (especially `gz-prod`) contain resources for IoT backends, mobile apps, and other production systems. Internal webapp developers need to deploy to these accounts but must not have write access to unrelated resources. The `gzweb` namespace solves this by:

1. Prefixing all webapp resource names with `gzweb-`
2. Providing an IAM group (`GzWebappDevelopers`) with policies scoped to `gzweb-*` resources
3. Tagging all webapp resources with `gz:namespace=gzweb` for attribute-based access control

## Resource Naming Convention

| Resource | Pattern | Example |
|----------|---------|---------|
| CloudFormation Stack | `GzWeb-{AppPascal}-{stage}` | `GzWeb-FleetTracker-dev` |
| DynamoDB Table | `gzweb-{stage}-{app}-{Table}` | `gzweb-dev-fleet-tracker-User` |
| S3 Bucket | `gzweb-{stage}-{app}-webapp` | `gzweb-dev-fleet-tracker-webapp` |
| Lambda Function | `gzweb-{stage}-{app}-{handler}` | `gzweb-dev-fleet-tracker-auth` |
| SSM Parameters | `/gzweb/{app}/{stage}/*` | `/gzweb/fleet-tracker/dev/jwt_secret` |
| API Gateway | `gzweb-{stage}-{app}-api` | `gzweb-dev-fleet-tracker-api` |

Where:
- `{app}` = kebab-case app slug (e.g., `fleet-tracker`)
- `{AppPascal}` = PascalCase app name (e.g., `FleetTracker`)
- `{stage}` = environment name (`dev`, `test`, `alpha`, `beta`, `stage`, `prod`)

## Required Tags

All resources MUST be tagged with:

| Tag Key | Value | Purpose |
|---------|-------|---------|
| `gz:namespace` | `gzweb` | IAM condition-based access control (especially CloudFront) |
| `gz:app` | `{app-name}` | Identifies which webapp owns the resource |
| `gz:stage` | `{stage}` | Identifies the environment |

The CDK stack applies these tags automatically via `cdk.Tags.of(this).add()`, which propagates to all child resources.

## IAM Access Model

### Group: GzWebappDevelopers

Webapp developers are added to this IAM group. The group has one managed policy (`GzWebappDeployAccess`) that grants:

| What | Scope | Notes |
|------|-------|-------|
| CDK deploy | 4 CDK bootstrap roles | Required for `cdk deploy` |
| S3 read/write | `gzweb-*` buckets only | Webapp static file sync |
| CloudFront invalidation | Distributions tagged `gz:namespace=gzweb` | Cache busting after deploy |
| CloudFront read | All distributions | Read-only; for deploy scripts |
| SSM read/write | `/gzweb/*` parameters only | OAuth secrets, JWT keys |
| KMS encrypt/decrypt | Via SSM only (`kms:ViaService` condition) | SecureString parameter support |
| CloudFormation describe | `GzWeb-*` stacks only | Reading stack outputs |
| DynamoDB read | `gzweb-*` tables only | Debugging; CDK handles writes |

### What Developers Cannot Do

- Touch S3 buckets outside `gzweb-*` (no IoT/app buckets)
- Read/write SSM parameters outside `/gzweb/*` (no IoT/app secrets)
- Write to DynamoDB tables outside `gzweb-*` (no IoT/app data)
- Invalidate CloudFront distributions not tagged as `gzweb`
- Modify IAM, VPC, or other account-level resources

### Onboarding a New Developer

```bash
# Run by an AWS admin (one-time per account)
./scripts/admin/setup-iam.sh --profile gz-dev --add-user gz_{username}_cli

# Or just add to the existing group
aws iam add-user-to-group \
  --group-name GzWebappDevelopers \
  --user-name gz_{username}_cli \
  --profile gz-{env}
```

## Agent Instructions

When creating or modifying AWS resources for a webapp:

1. **Always use the `gzweb-` prefix** for resource names
2. **Always use `/gzweb/` prefix** for SSM parameter paths
3. **Never create resources without the namespace prefix**, even temporarily
4. **Use `appTable()` from `lambda/shared/dynamo.ts`** for DynamoDB table names (it applies the prefix automatically)
5. **Follow the CDK stack's tag propagation pattern** by including `cdk.Tags.of(this).add()` for any new stack constructs

## Admin Setup

The IAM group and policy are defined in `scripts/admin/gzweb-iam.yaml` (CloudFormation template). Deploy with:

```bash
# Single account
./scripts/admin/setup-iam.sh --profile gz-dev

# All accounts
./scripts/admin/setup-iam.sh --all-accounts
```

See `scripts/admin/setup-iam.sh --help` for full usage.
