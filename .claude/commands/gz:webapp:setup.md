---
name: gz:webapp:setup
description: Interactive setup wizard for a new GZ webapp. Replaces placeholders, generates configs, validates the project.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

You are the setup wizard for a Goal Zero internal webapp. This project was created from the `gz-webapp-template` GitHub template. Your job is to collect configuration from the user, replace all `{{PLACEHOLDER}}` values, install dependencies, and validate everything works.

Run the five phases below in sequence. Do not skip any phase.

---

## Phase 1: Interview

Ask the user the following questions in a single grouped prompt. Provide the defaults shown below so they can accept or override.

**App Basics**
- **App name** (human-readable display name, e.g. "Fleet Tracker" or "Firmware Portal"):
- **Subdomain slug** (kebab-case, used for S3 buckets and DNS, e.g. "fleet-tracker"):
- **Short description** (one sentence for README/docs):

**AWS Configuration**
- **Environments to set up** (default: `dev` and `prod`):
- **AWS region** (default: `us-east-1`):

**Authentication**
- **Allowed email domains** (default: `bioliteenergy.com,goalzero.com`):
- **Extra RBAC roles** beyond `admin` and `user`? (default: none; if yes, collect role names and their permission sets):
- **Seed admin email** (the first admin user; default: the user's own email):

**Google OAuth**
- Do you already have Google OAuth client credentials for this app?
  - **If yes**: Collect the Client ID. The Client Secret will go into SSM, not in code.
  - **If no**: Provide step-by-step instructions:
    1. Go to [Google Cloud Console](https://console.cloud.google.com/)
    2. Create a new project (or select an existing one)
    3. Navigate to **APIs & Services > Credentials**
    4. Click **Create Credentials > OAuth client ID**
    5. Select **Web application**
    6. Set **Authorized JavaScript origins**: `http://localhost:5174` (for local dev; add your production domain later)
    7. Set **Authorized redirect URIs**: `http://localhost:5174/auth/callback` (add production callback URL later)
    8. Copy the **Client ID** and **Client Secret**
    9. The Client ID goes into `.env` files; the Client Secret goes into AWS SSM Parameter Store

**Initial Features (optional)**
- Describe any features this app should have beyond the built-in auth and user management. This is freeform and optional. If provided, it will be used to suggest a `/gz:webapp:scaffold` follow-up.

---

## Phase 2: Confirmation

After collecting all answers, print a full configuration summary:

```
=== Setup Configuration ===

App Display Name:  {name}
App Slug:          {slug}
App PascalCase:    {PascalCase}
Description:       {description}

Environments:      {env1}, {env2}
AWS Region:        {region}

Allowed Domains:   {domains}
Seed Admin:        {email}
RBAC Roles:        admin, user{, extra...}

Google OAuth:      {configured / not yet configured}
```

Ask the user to confirm: **"Does this look correct? Type 'yes' to proceed or describe what to change."**

Do not proceed until the user confirms.

---

## Phase 3: Scaffolding

Execute all changes:

1. **Build the placeholder replacement map** from confirmed values:
   - `{{APP_NAME}}` = subdomain slug (kebab-case, e.g. `fleet-tracker`)
   - `{{APP_NAME_PASCAL}}` = PascalCase derived from slug (e.g. `FleetTracker`)
   - `{{APP_DISPLAY_NAME}}` = human-readable name (e.g. `Fleet Tracker`)
   - `{{SEED_ADMIN_EMAIL}}` = seed admin email address

2. **Find and replace all placeholders** across the repo:
   - Use `Grep` to find every file containing `{{` (exclude `node_modules/`, `.git/`, `cdk.out/`, and this command file itself)
   - For each file, use `Edit` to replace every placeholder with its value
   - Track which files were modified

3. **Rename the CDK stack file** (if the slug differs from "app"):
   - Rename `cdk/lib/app-stack.ts` to `cdk/lib/{slug}-stack.ts`
   - Update the import in `cdk/bin/app.ts` to reference the new filename
   - Update the class name from `AppStack` to `{PascalCase}Stack` in both files

4. **Generate environment files**:
   - For each environment (e.g. dev, prod), update `webapp/.env.{env}` (Vite reads .env files from the webapp/ directory):
     ```
     VITE_API_URL=REPLACE_WITH_API_URL_AFTER_FIRST_DEPLOY
     ```
   - If the user provided a Google OAuth Client ID, add it as a comment for reference

5. **Add build scripts** for each environment to `webapp/package.json`:
   - Ensure `build:{env}` scripts exist (e.g. `"build:dev": "tsc && vite build --mode dev --outDir dist-dev"`)
   - The template ships with `build:dev` and `build:prod`; add any additional environments

6. **Set up template remote**:
   ```bash
   git remote add template https://github.com/GoalZero26503/gz-webapp-template.git
   ```

---

## Phase 4: Install and Validate

Run these checks and report pass/fail for each:

1. **Install dependencies**:
   - `cd webapp && npm install`
   - `cd lambda && npm install`
   - `cd cdk && npm install`

2. **TypeScript validation**:
   - `cd webapp && npx tsc --noEmit`
   - `cd lambda && npx tsc --noEmit`
   - `cd cdk && npx tsc --noEmit`

3. **CDK synthesis**:
   - `cd cdk && npx cdk synth --context stage=dev`
   - This validates the CDK stack generates valid CloudFormation

4. **Placeholder check**:
   - Grep for remaining `{{` across the entire repo (excluding node_modules, .git, cdk.out, and .claude/commands/)
   - If any remain, report them as warnings

Print results in a checklist format:
```
✅ webapp: npm install
✅ lambda: npm install
✅ cdk: npm install
✅ webapp: typecheck
✅ lambda: typecheck
✅ cdk: typecheck
✅ cdk: synth (dev)
✅ No remaining placeholders
```

If any check fails, show the error and suggest a fix.

---

## Phase 5: Next Steps

Print a summary of what was done and what to do next:

```
=== Setup Complete ===

Files modified: {count}
Environments configured: {list}

Next steps:
1. Set up Google OAuth credentials (if not done yet)
   - See docs/setup.md for the full walkthrough

2. Create SSM parameters for each environment (all paths use the `/gzweb/` namespace prefix):
   aws ssm put-parameter --name "/gzweb/{app-name}/dev/google_client_id" --value "YOUR_CLIENT_ID" --type String --profile gz-dev
   aws ssm put-parameter --name "/gzweb/{app-name}/dev/google_client_secret" --value "YOUR_SECRET" --type SecureString --profile gz-dev
   aws ssm put-parameter --name "/gzweb/{app-name}/dev/jwt_secret" --value "$(openssl rand -base64 32)" --type SecureString --profile gz-dev

   NOTE: If you get an AccessDenied error, your IAM user may not be in the GzWebappDevelopers group.
   Ask an AWS admin to run: ./scripts/admin/setup-iam.sh --profile gz-{env} --add-user {your-iam-username}

3. Deploy to dev:
   /gz:webapp:deploy dev

4. Start building features:
   /gz:webapp:scaffold "describe what you want to build"
```

If the user described initial features in Phase 1, remind them:
```
You mentioned wanting to build: "{description}"
Run /gz:webapp:scaffold with that description to get started.
```
