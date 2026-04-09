#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# sync-webapp.sh
# Build the webapp for a given stage and deploy to S3 + CloudFront.
#
# Usage: ./scripts/sync-webapp.sh <stage>
# Example: ./scripts/sync-webapp.sh dev
# ──────────────────────────────────────────────────────────────────

STAGE="${1:?Usage: ./scripts/sync-webapp.sh <stage>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read app name from webapp/package.json (strip the -webapp suffix)
APP_NAME=$(node -e "const p=require('$PROJECT_DIR/webapp/package.json'); console.log(p.name.replace(/-webapp$/, ''))")
if [ -z "$APP_NAME" ] || echo "$APP_NAME" | grep -q '{{'; then
  echo "Error: App name contains placeholders. Run /gz:webapp:setup first."
  exit 1
fi

# Derive PascalCase name from kebab-case for stack lookup
APP_NAME_PASCAL=$(echo "$APP_NAME" | sed -E 's/(^|-)([a-z])/\U\2/g')

# Map stage to AWS profile
declare -A PROFILES=(
  [dev]="gz-dev"
  [test]="gz-test"
  [alpha]="gz-alpha"
  [beta]="gz-beta"
  [stage]="gz-stage"
  [prod]="gz-prod"
)

PROFILE="${PROFILES[$STAGE]:-}"
if [ -z "$PROFILE" ]; then
  echo "Error: Unknown stage '$STAGE'. Valid stages: ${!PROFILES[*]}"
  exit 1
fi

BUCKET="${STAGE}-${APP_NAME}-webapp"
STACK_NAME="${APP_NAME_PASCAL}-${STAGE}"

# Verify AWS credentials
echo "Verifying AWS credentials for profile '$PROFILE'..."
if ! aws sts get-caller-identity --profile "$PROFILE" > /dev/null 2>&1; then
  echo "Error: AWS credentials not valid for profile '$PROFILE'."
  echo "Run: aws sso login --profile $PROFILE"
  exit 1
fi

# Check that the build script exists
if ! node -e "const p=require('$PROJECT_DIR/webapp/package.json'); if(!p.scripts['build:$STAGE']) process.exit(1)" 2>/dev/null; then
  echo "Error: No 'build:$STAGE' script found in webapp/package.json."
  echo "Add it: \"build:$STAGE\": \"tsc && vite build --mode $STAGE --outDir dist-$STAGE\""
  exit 1
fi

# Build
echo ""
echo "Building webapp for '$STAGE'..."
cd "$PROJECT_DIR/webapp" && npm run "build:${STAGE}"

# Verify build output exists
if [ ! -d "$PROJECT_DIR/webapp/dist-${STAGE}" ]; then
  echo "Error: Build output directory 'webapp/dist-${STAGE}/' not found."
  exit 1
fi

# Sync to S3
echo ""
echo "Syncing to s3://${BUCKET}/..."
aws s3 sync "$PROJECT_DIR/webapp/dist-${STAGE}/" "s3://${BUCKET}/" \
  --delete \
  --profile "$PROFILE"

# Get CloudFront distribution ID from CloudFormation stack outputs
echo ""
echo "Looking up CloudFront distribution ID from stack '$STACK_NAME'..."
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text 2>/dev/null) || true

if [ -z "$DIST_ID" ] || [ "$DIST_ID" = "None" ]; then
  echo "Warning: Could not find CloudFront distribution ID from stack '$STACK_NAME'."
  echo "S3 sync completed, but CloudFront was not invalidated."
  echo "You may need to invalidate manually or check the stack name."
  exit 0
fi

# Invalidate CloudFront
echo "Invalidating CloudFront distribution '$DIST_ID'..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --profile "$PROFILE" \
  > /dev/null

echo ""
echo "Done. S3 sync complete and CloudFront invalidation submitted."
echo "Changes may take 5-10 minutes to propagate globally."
