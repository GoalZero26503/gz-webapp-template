#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# setup-iam.sh
# Deploy the GzWebappDevelopers IAM group and policies to a GZ AWS account.
# Run once per account. Safe to re-run (CloudFormation is idempotent).
#
# Usage:
#   ./scripts/admin/setup-iam.sh --profile gz-dev
#   ./scripts/admin/setup-iam.sh --profile gz-prod
#   ./scripts/admin/setup-iam.sh --profile gz-dev --add-user gz_srobison_cli
#   ./scripts/admin/setup-iam.sh --all-accounts
#
# Prerequisites:
#   - AWS CLI v2 configured with SSO profiles (gz-dev, gz-prod, etc.)
#   - IAM admin permissions on the target account
# ──────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/gzweb-iam.yaml"
STACK_NAME="GzWebappIAM"
REGION="us-east-1"

ALL_PROFILES=("gz-dev" "gz-test" "gz-alpha" "gz-beta" "gz-stage" "gz-prod")

usage() {
  echo "Usage: $0 --profile <aws-profile> [--add-user <iam-username>]"
  echo "       $0 --all-accounts [--add-user <iam-username>]"
  echo ""
  echo "Options:"
  echo "  --profile <profile>    AWS CLI profile (e.g. gz-dev, gz-prod)"
  echo "  --all-accounts         Deploy to all 6 GZ accounts"
  echo "  --add-user <username>  Also add this IAM user to the GzWebappDevelopers group"
  echo ""
  echo "Examples:"
  echo "  $0 --profile gz-dev"
  echo "  $0 --profile gz-prod --add-user gz_srobison_cli"
  echo "  $0 --all-accounts"
  exit 1
}

deploy_to_account() {
  local profile="$1"
  local add_user="${2:-}"

  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "Deploying $STACK_NAME to profile: $profile"
  echo "══════════════════════════════════════════════════════════════"

  # Verify credentials
  echo "Verifying credentials..."
  if ! aws sts get-caller-identity --profile "$profile" > /dev/null 2>&1; then
    echo "ERROR: Credentials not valid for profile '$profile'."
    echo "Run: aws sso login --profile $profile"
    return 1
  fi

  local account_id
  account_id=$(aws sts get-caller-identity --profile "$profile" --query Account --output text)
  echo "Account: $account_id"

  # If the stack is in ROLLBACK_COMPLETE (failed first create), it must be
  # deleted before a new create can succeed. Safe because no resources exist.
  local existing_status
  existing_status=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile "$profile" \
    --region "$REGION" \
    --query "Stacks[0].StackStatus" \
    --output text 2>/dev/null || echo "NOT_FOUND")

  if [ "$existing_status" = "ROLLBACK_COMPLETE" ]; then
    echo "Stack is in ROLLBACK_COMPLETE; deleting before retry..."
    aws cloudformation delete-stack \
      --stack-name "$STACK_NAME" \
      --profile "$profile" \
      --region "$REGION"
    aws cloudformation wait stack-delete-complete \
      --stack-name "$STACK_NAME" \
      --profile "$profile" \
      --region "$REGION"
    echo "Previous failed stack deleted."
  fi

  # Deploy CloudFormation stack
  echo "Deploying CloudFormation stack..."
  aws cloudformation deploy \
    --template-file "$TEMPLATE" \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --profile "$profile" \
    --region "$REGION" \
    --no-fail-on-empty-changeset

  # Verify the stack is actually in a healthy state. `aws cloudformation deploy`
  # can exit 0 even when the stack rolled back, so check status explicitly.
  local final_status
  final_status=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile "$profile" \
    --region "$REGION" \
    --query "Stacks[0].StackStatus" \
    --output text)

  case "$final_status" in
    CREATE_COMPLETE|UPDATE_COMPLETE|UPDATE_COMPLETE_CLEANUP_IN_PROGRESS)
      echo "Stack deployed successfully. Status: $final_status"
      ;;
    *)
      echo "ERROR: Stack is in unexpected state: $final_status"
      echo "Fetching failure events..."
      aws cloudformation describe-stack-events \
        --stack-name "$STACK_NAME" \
        --profile "$profile" \
        --region "$REGION" \
        --query "StackEvents[?contains(ResourceStatus, 'FAILED')].[LogicalResourceId,ResourceStatus,ResourceStatusReason]" \
        --output table
      return 1
      ;;
  esac

  # Show outputs
  echo ""
  echo "Stack outputs:"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile "$profile" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" \
    --output table

  # Optionally add user to group
  if [ -n "$add_user" ]; then
    echo ""
    echo "Adding user '$add_user' to GzWebappDevelopers group..."
    if aws iam add-user-to-group \
      --group-name GzWebappDevelopers \
      --user-name "$add_user" \
      --profile "$profile" 2>/dev/null; then
      echo "User '$add_user' added to GzWebappDevelopers."
    else
      echo "WARNING: Could not add user '$add_user'. The user may not exist in account $account_id."
    fi
  fi
}

# Parse arguments
PROFILE=""
ADD_USER=""
ALL_ACCOUNTS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --add-user)
      ADD_USER="$2"
      shift 2
      ;;
    --all-accounts)
      ALL_ACCOUNTS=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

if [ "$ALL_ACCOUNTS" = true ]; then
  echo "Deploying to all GZ accounts: ${ALL_PROFILES[*]}"
  echo ""
  failures=()
  for p in "${ALL_PROFILES[@]}"; do
    if ! deploy_to_account "$p" "$ADD_USER"; then
      failures+=("$p")
    fi
  done
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  if [ ${#failures[@]} -eq 0 ]; then
    echo "All accounts deployed successfully."
  else
    echo "Deployment failed for: ${failures[*]}"
    echo "Fix credentials and re-run for those accounts."
    exit 1
  fi
elif [ -n "$PROFILE" ]; then
  deploy_to_account "$PROFILE" "$ADD_USER"
else
  usage
fi
