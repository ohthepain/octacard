#!/usr/bin/env bash
# Clean up old Terraform infra (us-east-1) and start fresh in eu-central-1.
# Run from project root: ./scripts/terraform-clean-restart.sh
# Use --quick to skip destroy/bootstrap (old infra gone, eu-central-1 bucket exists)

set -e
cd "$(dirname "$0")/../terraform"

QUICK=false
[ "$1" = "--quick" ] && QUICK=true

if [ "$QUICK" = true ]; then
  echo "=== Quick mode: clean + init only ==="
  rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup
  terraform init -backend-config=backend.hcl
  terraform workspace new staging 2>/dev/null || true
  terraform workspace new production 2>/dev/null || true
  terraform workspace select staging
  echo "Done. Run: pnpm run terraform:apply:staging"
  exit 0
fi

OLD_STATE_BUCKET_EXISTS=$(aws s3api head-bucket --bucket octacard-tf-state --region us-east-1 2>/dev/null && echo "yes" || echo "no")

if [ "$OLD_STATE_BUCKET_EXISTS" = "yes" ]; then
  echo "=== Step 1: Destroy staging infra (us-east-1) ==="
  terraform init -reconfigure -backend-config=backend.hcl.us-east-1
  terraform destroy -var-file=environments/staging/terraform.tfvars -auto-approve || echo "(no staging state or already destroyed)"

  echo ""
  echo "=== Step 2: Destroy production infra (us-east-1) ==="
  terraform init -reconfigure -backend-config=backend.hcl.us-east-1.production
  terraform destroy -var-file=environments/production/terraform.tfvars -auto-approve || echo "(no production state or already destroyed)"

  echo ""
  echo "=== Step 3: Remove old state bucket and DynamoDB (us-east-1) ==="
  aws s3 rb s3://octacard-tf-state --force --region us-east-1 2>/dev/null || true
  aws dynamodb delete-table --table-name octacard-terraform-locks --region us-east-1 2>/dev/null || true
else
  echo "=== Step 1-3: Skipping (old state bucket in us-east-1 already deleted) ==="
fi

echo ""
echo "=== Step 4: Delete any orphaned app buckets in us-east-1 ==="
aws s3 rb s3://octacard-staging-uploads --force --region us-east-1 2>/dev/null || true
aws s3 rb s3://octacard-production-uploads --force --region us-east-1 2>/dev/null || true

echo ""
echo "=== Step 5: Clean local Terraform ==="
rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup

echo ""
NEW_STATE_BUCKET_EXISTS=$(aws s3api head-bucket --bucket octacard-tf-state --region eu-central-1 2>/dev/null && echo "yes" || echo "no")
if [ "$NEW_STATE_BUCKET_EXISTS" = "yes" ]; then
  echo "=== Step 6: Skipping bootstrap (eu-central-1 state bucket already exists) ==="
else
  echo "=== Step 6: Bootstrap in eu-central-1 (AWS CLI - avoids Terraform S3 bug) ==="
  "$(dirname "$0")/bootstrap-aws.sh"
fi

echo ""
echo "=== Step 7: Init main Terraform with eu-central-1 backend ==="
terraform init -backend-config=backend.hcl
terraform workspace new staging 2>/dev/null || terraform workspace select staging
terraform workspace new production 2>/dev/null || terraform workspace select production

echo ""
echo "=== Done. Next: apply staging ==="
echo "  terraform workspace select staging"
echo "  terraform apply -var-file=environments/staging/terraform.tfvars"
echo ""
echo "Or: pnpm run terraform:apply:staging"
