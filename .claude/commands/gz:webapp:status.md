---
name: gz:webapp:status
description: Show project configuration, placeholder status, environment files, git state, and AWS deployment status.
allowed-tools: Read, Bash, Glob, Grep
---

You are the status reporter for a Goal Zero internal webapp. Collect and display a comprehensive overview of the project's current state.

## Sections to Report

Gather all information first, then print a single formatted report.

### 1. Project Configuration

Read `webapp/package.json`, `lambda/package.json`, and `cdk/package.json` to extract:
- App name (from package.json `name` fields)
- Version
- Available scripts (from webapp/package.json)

### 2. Placeholder Check

Search the entire repo for remaining `{{` patterns (exclude `node_modules/`, `.git/`, `cdk.out/`, `.claude/commands/`).

- If none found: report "All placeholders replaced"
- If found: list each file and placeholder, recommend running `/gz:webapp:setup`

### 3. Environment Files

List all `.env.*` files in the project root:
- For each file, show its contents (redacting any actual secrets)
- Flag any values that are `REPLACE_WITH_*` (not yet configured)
- Flag if expected environments (dev, prod) are missing

### 4. Git Status

Run:
- `git status --short` to show uncommitted changes
- `git branch --show-current` to show current branch
- `git remote -v` to show remotes (check if `template` remote exists)

### 5. Dependencies

Check if `node_modules/` exists in each package directory:
- `webapp/node_modules/`
- `lambda/node_modules/`
- `cdk/node_modules/`

If missing, recommend running `npm install` in that directory.

### 6. AWS Deployment Status (Optional)

Only attempt this if AWS credentials are likely available. Run `aws sts get-caller-identity --profile gz-dev 2>/dev/null`.

If credentials work, for each environment that has an `.env.{env}` file:
- Check CloudFormation stack status: `aws cloudformation describe-stacks --stack-name {PascalName}-{env} --profile gz-{env} --region us-east-1`
- Report: stack status (CREATE_COMPLETE, UPDATE_COMPLETE, etc.), last updated time, and key outputs (API URL, CloudFront domain)

If credentials fail, skip this section with a note: "AWS credentials not available. Run `aws sso login --profile gz-dev` to enable deployment status."

### 7. Actionable Next Steps

Based on findings, suggest the most important next action:
- If placeholders remain: "Run `/gz:webapp:setup` to configure the project"
- If dependencies missing: "Run `npm install` in {dirs}"
- If env files have REPLACE_WITH values: "Deploy first to get API URLs, or set up SSM parameters"
- If no deployment exists: "Run `/gz:webapp:deploy dev` for first deployment"
- If everything looks good: "Project is configured and deployed. Build features with `/gz:webapp:scaffold`"

## Output Format

```
=== Project Status ===

App: {name} v{version}
Branch: {branch}
Template Remote: {yes/no}

Placeholders: {all replaced / N remaining}
Dependencies: {all installed / missing in X}

Environments:
  dev:  .env.dev {exists/missing} | Stack: {status/not deployed}
  prod: .env.prod {exists/missing} | Stack: {status/not deployed}

{any warnings or issues}

Suggested next step: {action}
```
