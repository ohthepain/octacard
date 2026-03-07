# OctaCard Terraform

AWS infrastructure for OctaCard, with staging and production environments.

## Fresh Start (region/architecture change)

Use when switching regions or resetting infra from scratch.

### Option A: Run the script (recommended)

```bash
./scripts/terraform-clean-restart.sh
```

Then apply staging: `pnpm run terraform:apply:staging`

**Quick mode** – If old infra is already gone and the eu-central-1 state bucket exists:

```bash
./scripts/terraform-clean-restart.sh --quick
```

The script also skips bootstrap when the eu-central-1 state bucket already exists.

### Option B: Manual steps

```bash
cd terraform

# 1. Connect to OLD backend (us-east-1) and destroy
terraform init -reconfigure -backend-config=backend.hcl.us-east-1
terraform workspace select staging 2>/dev/null || terraform workspace new staging
terraform destroy -var-file=environments/staging/terraform.tfvars -auto-approve
terraform workspace select production 2>/dev/null || terraform workspace new production
terraform destroy -var-file=environments/production/terraform.tfvars -auto-approve

# 2. Delete old state bucket + DynamoDB in us-east-1
aws s3 rb s3://octacard-tf-state --force --region us-east-1
aws dynamodb delete-table --table-name octacard-terraform-locks --region us-east-1

# 3. Delete orphaned app buckets (if any)
aws s3 rb s3://octacard-staging-uploads --force --region us-east-1 2>/dev/null || true
aws s3 rb s3://octacard-production-uploads --force --region us-east-1 2>/dev/null || true

# 4. Clean local Terraform
rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup

# 5. Bootstrap in eu-central-1
cd bootstrap && terraform init && terraform apply -auto-approve && cd ..

# 6. Init with new backend and apply
terraform init -backend-config=backend.hcl
terraform workspace new staging
terraform workspace new production
terraform workspace select staging
terraform apply -var-file=environments/staging/terraform.tfvars
```

**Note:** If your old state used a different key (e.g. `production/terraform.tfstate`), edit `backend.hcl.us-east-1` and change the `key` line, then run destroy for that workspace.

## Prerequisites

1. **Terraform** >= 1.0
2. **AWS CLI** configured with credentials
3. **S3 bucket** for Terraform state (create manually or use bootstrap)
4. **DynamoDB table** for state locking (optional but recommended)

## Bootstrap (one-time)

**Recommended:** Use the AWS CLI script (avoids Terraform S3 provider bug):

```bash
./scripts/bootstrap-aws.sh
```

Or manually:

```bash
aws s3api create-bucket --bucket octacard-tf-state --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1
aws s3api put-bucket-versioning --bucket octacard-tf-state \
  --versioning-configuration Status=Enabled
aws dynamodb create-table \
  --table-name octacard-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-central-1
```

## Usage

Single backend, workspaces for staging/production. One init, same architecture for both environments.

```bash
cd terraform
terraform init -backend-config=backend.hcl
terraform workspace new staging   # first time only
terraform workspace new production  # first time only
```

### Staging

```bash
terraform workspace select staging
terraform plan -var-file=environments/staging/terraform.tfvars
terraform apply -var-file=environments/staging/terraform.tfvars
```

### Production

```bash
terraform workspace select production
terraform plan -var-file=environments/production/terraform.tfvars
terraform apply -var-file=environments/production/terraform.tfvars
```

### Via pnpm

```bash
pnpm run terraform:init
pnpm run terraform:plan:staging
pnpm run terraform:apply:staging
pnpm run terraform:plan:production
pnpm run terraform:apply:production
```

**State lock** – If Terraform fails with "Error acquiring the state lock" (e.g. after closing the laptop mid-apply):

```bash
pnpm run terraform:force-unlock:staging
```

## Outputs

- `s3_bucket_name` – Use for `S3_BUCKET` in Vercel env vars
- `s3_bucket_arn` – For IAM policies

## ECS Fargate + RDS + ElastiCache

Standalone VPC with ALB, ECS Fargate, RDS Postgres, ElastiCache Redis. Pass required secrets when applying:

```bash
TF_VAR_db_password='your-secure-password' \
TF_VAR_better_auth_secret='$(openssl rand -hex 32)' \
pnpm run terraform:apply:staging
```

After apply:

```bash
terraform output alb_dns_name        # App URL: http://<alb-dns>/
terraform output ecr_repository_url  # For Docker push
terraform output -raw database_url   # Run migrations
```

### Import existing secrets

If apply fails with "secret already exists" or "secret scheduled for deletion" (e.g. after a partial apply or recreate), import the secrets into state:

```bash
cd terraform
terraform workspace select staging   # or production

# Import each secret (use octacard-production/... for production)
terraform import aws_secretsmanager_secret.database_url octacard-staging/database-url
terraform import aws_secretsmanager_secret.redis_url octacard-staging/redis-url
terraform import aws_secretsmanager_secret.better_auth_secret octacard-staging/better-auth-secret

# Then apply again
TF_VAR_db_password='...' TF_VAR_better_auth_secret='...' terraform apply -var-file=environments/staging/terraform.tfvars
```

For **redis-url** "scheduled for deletion": restore it in AWS Console (Secrets Manager → select secret → Cancel deletion) before importing.

### Deploy the app

1. **Run Prisma migrations:**

   ```bash
   DATABASE_URL="postgresql://..." pnpm prisma migrate deploy
   ```

2. **Build and push Docker image:**

   ```bash
   pnpm run docker:build:staging
   ```

   Or manually:

   ```bash
   aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin $(cd terraform && terraform output -raw ecr_repository_url | cut -d/ -f1)
   docker build -t $(cd terraform && terraform output -raw ecr_repository_url):staging .
   docker push $(cd terraform && terraform output -raw ecr_repository_url):staging
   aws ecs update-service --cluster octacard-staging-cluster --service octacard-staging-service --force-new-deployment --region eu-central-1
   ```

4. **Add ALB URL to S3 CORS** (for uploads): Add `http://<alb-dns-name>/` to `cors_allowed_origins` in tfvars and re-apply.

### Destroy and recreate

Secrets have `prevent_destroy` so Terraform won't delete them. To destroy cleanly:

```bash
# 1. Remove secrets from state
terraform state rm aws_secretsmanager_secret_version.database_url aws_secretsmanager_secret_version.redis_url aws_secretsmanager_secret_version.better_auth_secret
terraform state rm aws_secretsmanager_secret.database_url aws_secretsmanager_secret.redis_url aws_secretsmanager_secret.better_auth_secret

# 2. Delete secrets in AWS (immediate, no recovery window)
aws secretsmanager delete-secret --secret-id octacard-staging/database-url --force-delete-without-recovery --region eu-central-1
aws secretsmanager delete-secret --secret-id octacard-staging/redis-url --force-delete-without-recovery --region eu-central-1
aws secretsmanager delete-secret --secret-id octacard-staging/better-auth-secret --force-delete-without-recovery --region eu-central-1

# 3. Destroy the rest
pnpm run terraform:destroy:staging
```

Recreate with a normal apply (secrets are gone, so they'll be created fresh).
