# Admin Scripts

Scripts that require IAM admin access. Run these once per AWS account to set up the shared infrastructure that webapp developers depend on.

## Who Should Run These

Only AWS admins with IAM write access to the target account (e.g., account owner, DevOps). These scripts create IAM groups and policies, not webapp resources.

## Scripts

### `setup-iam.sh`

Deploys the `GzWebappDevelopers` IAM group and attached managed policy to a GZ AWS account. The group grants webapp developers scoped access to `gzweb-*` resources without exposing IoT/app/other production resources.

```bash
# Deploy to a single account
./setup-iam.sh --profile gz-dev

# Deploy to all 6 GZ accounts
./setup-iam.sh --all-accounts

# Deploy and add a user to the group in one step
./setup-iam.sh --profile gz-prod --add-user gz_srobison_cli

# Add an existing user to the group (group must already exist)
aws iam add-user-to-group \
  --group-name GzWebappDevelopers \
  --user-name gz_{username}_cli \
  --profile gz-{env}
```

Safe to re-run. CloudFormation is idempotent; if nothing changed, it's a no-op.

### `gzweb-iam.yaml`

CloudFormation template defining the IAM group and policy. Deployed by `setup-iam.sh`. Stack name: `GzWebappIAM`.

See inline comments for what each policy statement grants and why.

## Namespace Reference

For the full namespace model (why this exists, what resources are scoped, tag conventions), see `.agents/docs/aws-namespace.md`.
