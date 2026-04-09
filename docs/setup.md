# Setup Guide

This guide walks you through creating a new internal webapp from the Goal Zero template. You will need about 30 minutes for the initial setup.

## Prerequisites

Before starting, make sure you have these installed:

- **Node.js 20 or newer**: Download from [nodejs.org](https://nodejs.org/). Check with `node --version`.
- **AWS CLI v2**: Download from [aws.amazon.com/cli](https://aws.amazon.com/cli/). Check with `aws --version`.
- **CDK CLI**: Install with `npm install -g aws-cdk`. Check with `cdk --version`.
- **Claude Code**: Install from [claude.ai/code](https://claude.ai/code)
- **GitHub account**: Must be a member of the [GoalZero26503](https://github.com/GoalZero26503) organization

You also need AWS SSO access configured. If you can run `aws sts get-caller-identity --profile gz-dev` and see your account info, you are good to go. If not, ask the software team for access.

## Step 1: Create Your Repository

1. Go to [github.com/GoalZero26503/gz-webapp-template](https://github.com/GoalZero26503/gz-webapp-template)
2. Click the green **"Use this template"** button
3. Choose **"Create a new repository"**
4. Set the owner to **GoalZero26503**
5. Give it a name that describes your app (e.g. `fleet-tracker`, `firmware-portal`)
6. Keep it **Private**
7. Click **"Create repository"**

## Step 2: Clone and Open in Claude Code

```bash
git clone git@github.com:GoalZero26503/your-app-name.git
cd your-app-name
claude
```

This opens Claude Code in your project directory.

## Step 3: Run the Setup Wizard

In Claude Code, type:

```
/gz:webapp:setup
```

The wizard will ask you a few questions:
- **App name**: A human-readable name like "Fleet Tracker" or "Firmware Portal"
- **Subdomain**: A short slug like "fleet-tracker" (used for URLs and AWS resource names)
- **Description**: A one-sentence summary
- **Environments**: Which AWS environments you need (default: dev and prod)
- **Email domains**: Which company domains can log in (default: goalzero.com and bioliteenergy.com)
- **Admin email**: Your email address (you will be the first admin)

The wizard then replaces all template placeholders, installs dependencies, and validates everything compiles correctly.

## Step 4: Set Up Google OAuth Credentials

Your app needs Google OAuth credentials so users can sign in with their company Google accounts.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** in the left sidebar, then **Credentials**
4. Click **"+ Create Credentials"** at the top, then **"OAuth client ID"**
5. If prompted, configure the OAuth consent screen first:
   - User type: **Internal** (company users only)
   - App name: your app's display name
   - Support email: your email
   - Save and continue through the remaining steps
6. Back on the Credentials page, click **"+ Create Credentials" > "OAuth client ID"**
7. Application type: **Web application**
8. Name: your app name
9. **Authorized JavaScript origins**: Add `http://localhost:5174`
10. **Authorized redirect URIs**: Add `http://localhost:5174/auth/callback`
11. Click **Create**
12. Copy the **Client ID** and **Client Secret** (you will need both in the next step)

You will add your production domain to these settings later, after the first deploy.

## Step 5: Create SSM Parameters

The app reads secrets from AWS Systems Manager Parameter Store. You need to create three parameters for each environment.

For **dev** environment:

```bash
# Google OAuth Client ID (plain text)
aws ssm put-parameter \
  --name "/your-app-name/dev/google_client_id" \
  --value "YOUR_GOOGLE_CLIENT_ID_HERE" \
  --type String \
  --profile gz-dev

# Google OAuth Client Secret (encrypted)
aws ssm put-parameter \
  --name "/your-app-name/dev/google_client_secret" \
  --value "YOUR_GOOGLE_CLIENT_SECRET_HERE" \
  --type SecureString \
  --profile gz-dev

# JWT signing secret (generate a random one)
aws ssm put-parameter \
  --name "/your-app-name/dev/jwt_secret" \
  --value "$(openssl rand -base64 32)" \
  --type SecureString \
  --profile gz-dev
```

Replace `your-app-name` with the subdomain slug you chose in the setup wizard.

Repeat for **prod** (using `--profile gz-prod` and `/your-app-name/prod/...` paths). You can use the same Google Client ID and Secret for all environments, or create separate ones.

## Step 6: First Deploy to Dev

In Claude Code, type:

```
/gz:webapp:deploy dev
```

This will:
1. Deploy the AWS infrastructure (Lambda functions, DynamoDB table, API Gateway, S3 bucket, CloudFront)
2. Build the webapp
3. Upload it to S3
4. Create a CloudFront cache invalidation

When it finishes, it will show you the app URL (a CloudFront domain like `d1234abcdef.cloudfront.net`).

## Step 7: Verify

1. Open the URL from the deploy output in your browser
2. You should see the login page
3. Click "Sign in with Google"
4. Sign in with the admin email you specified during setup
5. You should land on the Dashboard page

If this is working, go back to [Google Cloud Console](https://console.cloud.google.com/) and add your CloudFront domain:
- **Authorized JavaScript origins**: Add `https://d1234abcdef.cloudfront.net`
- **Authorized redirect URIs**: Add `https://d1234abcdef.cloudfront.net/auth/callback`

## Troubleshooting

### "Unable to assume role" or credentials error
Your AWS SSO session may have expired. Run:
```bash
aws sso login --profile gz-dev
```

### "CDKToolkit stack not found" or bootstrap error
The AWS account needs to be bootstrapped for CDK:
```bash
npx cdk bootstrap aws://336507940372/us-east-1 --profile gz-dev
```

### "Parameter not found" error during login
You have not created the SSM parameters yet. Go back to Step 5.

### "Access restricted to authorized domain accounts"
The Google account you are signing in with is not from an allowed email domain. Check the `ALLOWED_DOMAINS` setting in the CDK stack.

### "You have not been invited to this application"
Your email is not in the user allowlist. The seed admin email (from setup) is automatically added. Other users need to be invited through the User Management page.

### Webapp shows a blank page
Open the browser developer console (F12) and check for errors. Common causes:
- `VITE_API_URL` is not set correctly in `.env.{env}`
- The API Gateway URL changed after a redeploy (update the env file and rebuild)

### CloudFront still showing old version
CloudFront caches aggressively. After deploying, it can take 5-10 minutes for the invalidation to propagate. You can check the invalidation status in the AWS Console under CloudFront > your distribution > Invalidations.
