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

## Shared network (one-time, before first staging/production apply)

Creates 1 shared VPC for both staging and production:

```bash
pnpm run terraform:network:init
pnpm run terraform:network:apply
```

Then apply staging or production as usual.

**Migration from separate VPCs:** If you have existing staging/production with their own VPCs, destroy them first (`terraform:destroy:staging`, `terraform:destroy:production`), then apply the network, then re-apply staging and production. This frees the VPC limit and consolidates to the shared VPC.

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

- `s3_bucket_name` – Use for `S3_BUCKET` secret
- `s3_bucket_arn` – For IAM policies
- `app_url` – App URL (HTTPS when domain configured, else HTTP ALB DNS)

## ECS Fargate + RDS

Standalone VPC with ALB, ECS Fargate, RDS Postgres. Job queues use pg-boss (PostgreSQL).

**Secrets:** Edit `terraform/environments/staging/terraform.tfvars` and replace `REPLACE_ME` with your `db_password` and `better_auth_secret` (generate with `openssl rand -hex 32`). Prefer AWS-managed RDS CA trust by setting `db_ca_cert_identifier` (for example from `aws rds describe-certificates`) and leaving `database_ca_cert_base64` empty. Only set `database_ca_cert_base64` if you intentionally use a private/self-signed CA chain. For Google sign-in, add `google_client_id` and `google_client_secret` (from Google Cloud Console → APIs & Services → Credentials). The tfvars files are gitignored. If they were previously committed, run `git rm --cached terraform/environments/*/terraform.tfvars` once to stop tracking them.

Then apply:

```bash
pnpm run terraform:apply:staging
```

After apply:

```bash
terraform output app_url             # App URL (HTTPS when domain set)
terraform output ecr_repository_url  # For Docker push
terraform output -raw database_url   # Run migrations
```

### HTTPS (File System Access API)

The File System Access API (`showDirectoryPicker`) requires HTTPS. To enable it on AWS:

1. Add `domain_name` and `route53_zone_id` to your tfvars (e.g. `staging.octacard.live` and the hosted zone ID for `octacard.live`).
2. Add `https://<domain_name>` to `cors_allowed_origins`.
3. Re-apply. Terraform creates: ACM cert (us-east-1 for CloudFront), CloudFront distribution, Route 53 A record pointing to CloudFront. `BETTER_AUTH_URL` uses `https://<domain_name>`.

**Quick deploy without domain:** To get a stack up without waiting for ACM validation, temporarily set `domain_name = ""` and `route53_zone_id = ""` in tfvars. You get HTTP-only (ALB URL). Add domain back later and re-apply for HTTPS/CloudFront.

### Import existing secrets

If apply fails with "secret already exists" or "secret scheduled for deletion" (e.g. after a partial apply or recreate), import the secrets into state:

```bash
cd terraform
terraform workspace select staging   # or production

# Import each secret (use octacard-production/... for production)
terraform import aws_secretsmanager_secret.database_url octacard-staging/database-url
terraform import aws_secretsmanager_secret.better_auth_secret octacard-staging/better-auth-secret
# Optional: only when database_ca_cert_base64 is set in tfvars
terraform import aws_secretsmanager_secret.database_ca_cert_base64[0] octacard-staging/database-ca-cert-base64

# Then apply again
pnpm run terraform:apply:staging
```

**DuplicateListener:** If a previous apply failed partway, an orphaned HTTP listener may exist. Delete it in AWS Console (EC2 → Load Balancers → your ALB → Listeners → remove the HTTP:80 listener), then run apply again.

### Deploy the app

Migrations run automatically when the container starts (see `scripts/start.sh`). For a one-off run (e.g. after recreating the database):

```bash
cd terraform && terraform workspace select staging
DATABASE_URL="$(terraform output -raw database_url)" pnpm prisma migrate deploy --schema=../prisma/schema.prisma
```

**Build and push Docker image:**

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

**Add app URL to S3 CORS** (for uploads): If you get 403 on OPTIONS when uploading (e.g. pack cover), add your origin to `cors_allowed_origins` in tfvars, then `terraform apply`. For local dev with ngrok, add your ngrok URL (e.g. `https://xxx.ngrok-free.dev`) or `https://*.ngrok-free.dev`.

### Destroy and recreate

Secrets have `prevent_destroy` so Terraform won't delete them. To destroy cleanly:

```bash
# 1. Remove secrets from state (required before destroy)
pnpm run terraform:state:rm-secrets:staging

# 2. Delete secrets in AWS (immediate, no recovery window)
pnpm run aws:delete:secret:staging:database-url
pnpm run aws:delete:secret:staging:better-auth-secret

# 3. Destroy the rest
pnpm run terraform:destroy:staging
```

Recreate with a normal apply (secrets are gone, so they'll be created fresh).

### RDS destroy: "final_snapshot_identifier is required"

The AWS provider uses **state** values for destroy, not config. If production RDS was created without `final_snapshot_identifier`, destroy fails even with `-var="skip_final_snapshot=true"`. Workaround:

```bash
cd terraform
terraform workspace select production

# 1. Delete RDS in AWS Console: RDS → Databases → octacard-production-db → Delete
#    Check "Skip final snapshot" (no backup needed) or provide a snapshot name.

# 2. Remove RDS from Terraform state (it's already gone in AWS)
pnpm run terraform:state:rm-rds:production
# Or: terraform state rm aws_db_instance.postgres

# 3. Destroy the rest
terraform destroy -var-file=environments/production/terraform.tfvars -auto-approve
```

### "Authentication failed" / database credentials not valid

The secret in Secrets Manager has `ignore_changes` so Terraform won't update it when you change `db_password` in tfvars. If the secret is out of sync with RDS (e.g. after changing the password or recreating), update it manually:

```bash
cd terraform
terraform workspace select staging

# 1. Get the correct connection string (uses current tfvars, URL-encodes password)
terraform output -raw database_url

# 2. Update the secret in AWS Console: Secrets Manager → octacard-staging/database-url → Retrieve secret value → Edit → paste the URL → Save

# 3. Force ECS to pick up the new secret
aws ecs update-service --cluster octacard-staging-cluster --service octacard-staging-service --force-new-deployment --region eu-central-1
```

**Password with special characters:** If your `db_password` contains `@`, `:`, `/`, `#`, etc., Terraform now URL-encodes it. If the secret was created before that fix, update it manually with the output from `terraform output -raw database_url`.

### `no pg_hba.conf entry ..., no encryption`

This means the app is attempting a non-SSL Postgres connection while RDS requires SSL.

`DATABASE_URL` must include `?sslmode=verify-full`, for example:

```text
postgresql://<user>:<password>@<host>/octacard?sslmode=verify-full
```

If production is currently down, update `octacard-production/database-url` in Secrets Manager with the SSL URL and force a new ECS deployment.

### Registration emails not received (staging/production)

1. **SES env vars** – Ensure `SES_FROM_EMAIL` and `SES_CONFIGURATION_SET` are set in the ECS task (Terraform passes these from `ses_from_email` and `ses_configuration_set`).

2. **From address matches verified domain** – `ses_from_email` must use the verified domain. For staging (`domain_name = "staging.octacard.live"`), use `no-reply@staging.octacard.live`. For production (`domain_name = "octacard.live"`), use `no-reply@octacard.live`.

3. **SES Sandbox** – In sandbox mode, you can only send to verified addresses. Verify recipient emails in SES Console, or request production access.

4. **DKIM verification** – After creating the domain identity, add the CNAME records from SES to your Route 53 zone. Until DKIM is verified, some providers may reject or spam-filter messages.

### Stuck destroy (DependencyViolation / AuthFailure on RDS ENI)

If destroy fails with subnet/security group/IGW dependency errors, destroy in order:

```bash
cd terraform
terraform workspace select staging

# 1. Destroy RDS first (releases the ENI blocking subnets/SGs)
terraform destroy -target=aws_db_instance.postgres -var-file=environments/staging/terraform.tfvars -auto-approve

# 2. Destroy ECS, ALB, etc.
terraform destroy -target=aws_ecs_service.app -var-file=environments/staging/terraform.tfvars -auto-approve

# 3. Full destroy for the rest
terraform destroy -var-file=environments/staging/terraform.tfvars -auto-approve
```
