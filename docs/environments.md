# Environments

This guide explains how environments work and how to add new ones.

## Default Environments

The template ships with two environments:

| Environment | Purpose | Who uses it |
|-------------|---------|-------------|
| **dev** | Development and testing | You, during development |
| **prod** | Production | End users |

Most apps only need these two. Add more environments if your app needs a QA stage, beta testing, or a staging environment that mirrors production.

## How Multi-Environment Works

Each environment is a completely separate deployment in a different AWS account. When you deploy to "dev", CDK creates a full set of resources in the dev AWS account. When you deploy to "prod", it creates a separate set in the prod account. Nothing is shared between environments.

Each environment gets:
- Its own DynamoDB tables (with the environment name as a prefix)
- Its own Lambda functions
- Its own API Gateway endpoint (unique URL)
- Its own S3 bucket for the webapp
- Its own CloudFront distribution
- Its own SSM parameters (secrets)

This means you can safely test in dev without any risk of affecting production.

## AWS Account Mapping

Goal Zero uses separate AWS accounts for each environment:

| Environment | AWS Profile | Account ID |
|-------------|-------------|------------|
| dev | gz-dev | 336507940372 |
| test | gz-test | 027165054099 |
| alpha | gz-alpha | 083837808427 |
| beta | gz-beta | 943878440428 |
| stage | gz-stage | 678658412915 |
| prod | gz-prod | 520397908078 |

When running AWS commands, always use the `--profile` flag for the target environment.

## Domain Naming

When you set up a custom domain for your app, follow this naming convention:

| Environment | Domain Pattern | Example |
|-------------|---------------|---------|
| dev | `{subdomain}-dev.goalzeroapp.com` | `fleet-tracker-dev.goalzeroapp.com` |
| test | `{subdomain}-test.goalzeroapp.com` | `fleet-tracker-test.goalzeroapp.com` |
| alpha | `{subdomain}-alpha.goalzeroapp.com` | `fleet-tracker-alpha.goalzeroapp.com` |
| beta | `{subdomain}-beta.goalzeroapp.com` | `fleet-tracker-beta.goalzeroapp.com` |
| stage | `{subdomain}-stage.goalzeroapp.com` | `fleet-tracker-stage.goalzeroapp.com` |
| prod | `{subdomain}.goalzeroapp.com` | `fleet-tracker.goalzeroapp.com` |

Production does not include an environment suffix; all other environments do.

## Adding a New Environment

Follow these steps to add an environment (for example, "test"):

### 1. Create the Environment File

Create a file named `.env.test` in the project root:

```
VITE_API_URL=REPLACE_WITH_API_URL_AFTER_FIRST_DEPLOY
```

### 2. Add the Build Script

Open `webapp/package.json` and add a build script for the new environment in the `"scripts"` section:

```json
"build:test": "tsc && vite build --mode test --outDir dist-test"
```

### 3. Create SSM Parameters

Create the three required secrets in the target AWS account:

```bash
aws ssm put-parameter \
  --name "/your-app-name/test/google_client_id" \
  --value "YOUR_GOOGLE_CLIENT_ID" \
  --type String \
  --profile gz-test

aws ssm put-parameter \
  --name "/your-app-name/test/google_client_secret" \
  --value "YOUR_GOOGLE_CLIENT_SECRET" \
  --type SecureString \
  --profile gz-test

aws ssm put-parameter \
  --name "/your-app-name/test/jwt_secret" \
  --value "$(openssl rand -base64 32)" \
  --type SecureString \
  --profile gz-test
```

### 4. Bootstrap CDK (First Time Only)

If CDK has never been used in this AWS account before:

```bash
npx cdk bootstrap aws://027165054099/us-east-1 --profile gz-test
```

### 5. Deploy

Use the deploy command in Claude Code:

```
/gz:webapp:deploy test
```

Or deploy manually:

```bash
# Deploy infrastructure
cd cdk && npx cdk deploy --context stage=test --context account=027165054099 --profile gz-test

# Update .env.test with the API URL from CDK output

# Build and deploy webapp
cd webapp && npm run build:test
aws s3 sync dist-test/ s3://test-your-app-name-webapp/ --delete --profile gz-test
```

### 6. Update Google OAuth

Add the new CloudFront domain to your Google OAuth credentials:
- Authorized JavaScript origins: `https://{cloudfront-domain}`
- Authorized redirect URIs: `https://{cloudfront-domain}/auth/callback`

## ACM Certificates

If you use a custom domain, the SSL certificate must be created in the **us-east-1** region. This is a CloudFront requirement regardless of where your other resources are deployed.

To request a certificate:

```bash
aws acm request-certificate \
  --domain-name fleet-tracker-test.goalzeroapp.com \
  --validation-method DNS \
  --profile gz-test \
  --region us-east-1
```

After requesting, you need to validate ownership by adding a DNS CNAME record. The AWS Console shows the exact record to add under **Certificate Manager > your certificate > Domains**.
