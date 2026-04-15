# Deployment Reference

## Prerequisites

- **AWS CLI v2**: Installed and configured with SSO profiles
- **CDK CLI**: `npm install -g aws-cdk` (v2)
- **AWS profiles**: Named `gz-{env}` for each environment (e.g. `gz-dev`, `gz-prod`)
- **CDK bootstrapped**: Each account must be bootstrapped with `cdk bootstrap` (one-time)

## GZ AWS Accounts

| Environment | AWS Profile | Account ID | Usage |
|-------------|-------------|------------|-------|
| dev | gz-dev | 336507940372 | Development and testing |
| test | gz-test | 027165054099 | QA testing |
| alpha | gz-alpha | 083837808427 | Early access |
| beta | gz-beta | 943878440428 | Pre-release |
| stage | gz-stage | 678658412915 | Staging (production mirror) |
| prod | gz-prod | 520397908078 | Production |

## Two-Step Deploy Process

Deployment happens in two stages: infrastructure (CDK) and frontend (S3 + CloudFront).

### Step 1: CDK Deploy (Infrastructure)

Deploys Lambda functions, API Gateway, DynamoDB tables, S3 bucket, and CloudFront distribution.

```bash
cd cdk && npx cdk deploy \
  --context stage={env} \
  --context account={account_id} \
  --profile gz-{env} \
  --require-approval never
```

The stack name follows the pattern `GzWeb-{AppPascal}-{stage}` (e.g. `GzWeb-FleetTracker-dev`).

CDK outputs after deploy:
- `ApiUrl`: HTTP API Gateway endpoint (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com`)
- `WebappBucketName`: S3 bucket name for the webapp
- `DistributionId`: CloudFront distribution ID (needed for invalidation)
- `DistributionDomain`: CloudFront domain (e.g. `d1234abcdef.cloudfront.net`)
- `AppUserTableName`: DynamoDB table name for users

### Step 2: Webapp Deploy (S3 + CloudFront)

Build the frontend and sync to S3.

```bash
# Build for the target environment
cd webapp && npm run build:{env}

# Sync to S3
aws s3 sync dist-{env}/ s3://{bucket_name}/ --delete --profile gz-{env}

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id {distribution_id} \
  --paths '/*' \
  --profile gz-{env}
```

CloudFront invalidation takes 5-10 minutes to propagate globally.

## CDK Context Parameters

These are passed via `--context key=value` on the CDK CLI:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `stage` | Yes | `dev` | Environment name |
| `account` | Yes | `336507940372` | AWS account ID |
| `seedAdminEmail` | No | From `cdk.json` | Email for the first admin user |
| `domainName` | No | None | Custom domain (e.g. `fleet-tracker.goalzeroapp.com`) |
| `certificateArn` | No | None | ACM certificate ARN for the custom domain |

## First Deploy Checklist

Before deploying for the first time to a new environment:

1. **Ensure the AWS account is CDK-bootstrapped**:
   ```bash
   npx cdk bootstrap aws://{account_id}/us-east-1 --profile gz-{env}
   ```

2. **Create SSM parameters**:
   ```bash
   aws ssm put-parameter \
     --name "/gzweb/{app-name}/{env}/google_client_id" \
     --value "YOUR_GOOGLE_CLIENT_ID" \
     --type String \
     --profile gz-{env}

   aws ssm put-parameter \
     --name "/gzweb/{app-name}/{env}/google_client_secret" \
     --value "YOUR_GOOGLE_CLIENT_SECRET" \
     --type SecureString \
     --profile gz-{env}

   aws ssm put-parameter \
     --name "/gzweb/{app-name}/{env}/jwt_secret" \
     --value "$(openssl rand -base64 32)" \
     --type SecureString \
     --profile gz-{env}
   ```

3. **Deploy CDK stack** (creates all resources):
   ```bash
   cd cdk && npx cdk deploy --context stage={env} --context account={account_id} --profile gz-{env}
   ```

4. **Update `.env.{env}`** with the API URL from CDK output

5. **Build and deploy webapp** (S3 sync + CloudFront invalidation)

6. **Update Google OAuth settings**: Add the CloudFront domain to:
   - Authorized JavaScript origins: `https://{cloudfront_domain}`
   - Authorized redirect URIs: `https://{cloudfront_domain}/auth/callback`

## Adding a New Environment

1. Create `webapp/.env.{env}` (Vite reads .env files from the webapp/ directory):
   ```
   VITE_API_URL=REPLACE_WITH_API_URL_AFTER_FIRST_DEPLOY
   ```

2. Add a `build:{env}` script to `webapp/package.json`:
   ```json
   "build:{env}": "tsc && vite build --mode {env} --outDir dist-{env}"
   ```

3. Create SSM parameters for the new environment (see checklist above)

4. Deploy CDK with the new stage:
   ```bash
   cd cdk && npx cdk deploy --context stage={env} --context account={account_id} --profile gz-{env}
   ```

5. Build and sync webapp

## Rollback

### CDK Rollback
If a CDK deploy causes issues, CloudFormation can roll back:
```bash
aws cloudformation rollback-stack --stack-name GzWeb-{AppPascal}-{env} --profile gz-{env}
```

Or redeploy a previous known-good commit:
```bash
git checkout {good-commit}
cd cdk && npx cdk deploy --context stage={env} --context account={account_id} --profile gz-{env}
```

### Webapp Rollback
Re-deploy a previous webapp build:
```bash
git checkout {good-commit}
cd webapp && npm run build:{env}
aws s3 sync dist-{env}/ s3://{bucket_name}/ --delete --profile gz-{env}
aws cloudfront create-invalidation --distribution-id {dist_id} --paths '/*' --profile gz-{env}
```

## Custom Domains

To use a custom domain (e.g. `fleet-tracker.goalzeroapp.com`):

1. **Create an ACM certificate** in `us-east-1` (required for CloudFront):
   ```bash
   aws acm request-certificate \
     --domain-name fleet-tracker.goalzeroapp.com \
     --validation-method DNS \
     --profile gz-{env} \
     --region us-east-1
   ```

2. **Validate the certificate** by adding the DNS CNAME record

3. **Deploy CDK with domain context**:
   ```bash
   cd cdk && npx cdk deploy \
     --context stage={env} \
     --context account={account_id} \
     --context domainName=fleet-tracker.goalzeroapp.com \
     --context certificateArn=arn:aws:acm:us-east-1:... \
     --profile gz-{env}
   ```

4. **Create a CNAME DNS record** pointing the domain to the CloudFront distribution domain

## Domain Naming Convention

- **Dev/Test/etc.**: `{subdomain}-{env}.goalzeroapp.com` (e.g. `fleet-tracker-dev.goalzeroapp.com`)
- **Production**: `{subdomain}.goalzeroapp.com` (e.g. `fleet-tracker.goalzeroapp.com`)

## IAM Requirements

Webapp developers must be in the `GzWebappDevelopers` IAM group (see `scripts/admin/setup-iam.sh`). This group grants scoped access to `gzweb-*` resources only. See `.agents/docs/aws-namespace.md` for the full access model.
