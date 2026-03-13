#!/usr/bin/env bash
# Start staging resources after staging-down.sh.
# Run from project root: ./scripts/staging-up.sh
#
# Starts: RDS instance, recreates ElastiCache Redis, ECS service (scale to 1).
# Requires: terraform, AWS CLI. Terraform recreates Redis and updates redis-url secret.

set -e
REGION="${AWS_REGION:-eu-central-1}"
ECS_DESIRED_COUNT="${ECS_DESIRED_COUNT:-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Starting staging resources (region: $REGION) ==="

echo "Starting RDS instance..."
aws rds start-db-instance \
  --db-instance-identifier octacard-staging-db \
  --region "$REGION" \
  --output text --query 'DBInstance.DBInstanceStatus'

echo "Waiting for RDS to become available (this may take a few minutes)..."
aws rds wait db-instance-available \
  --db-instance-identifier octacard-staging-db \
  --region "$REGION"

echo "Recreating ElastiCache Redis cluster (Terraform apply)..."
(cd "$PROJECT_ROOT/terraform" && \
  terraform init -backend-config=backend.hcl -input=false -reconfigure && \
  terraform workspace select staging 2>/dev/null || terraform workspace new staging && \
  terraform apply \
    -target=aws_elasticache_cluster.redis \
    -target=aws_secretsmanager_secret_version.redis_url \
    -var-file=environments/staging/terraform.tfvars \
    -auto-approve -input=false)

echo "Waiting for Redis to become available..."
aws elasticache wait cache-cluster-available \
  --cache-cluster-id octacard-staging-redis \
  --region "$REGION"

echo "Scaling ECS service to $ECS_DESIRED_COUNT..."
aws ecs update-service \
  --cluster octacard-staging-cluster \
  --service octacard-staging-service \
  --desired-count "$ECS_DESIRED_COUNT" \
  --region "$REGION" \
  --force-new-deployment \
  --output text --query 'service.deployments[0].status'

echo "=== Staging resources started ==="
