#!/usr/bin/env bash
# Start staging resources after staging-down.sh.
# Run from project root: ./scripts/staging-up.sh
#
# Starts: RDS instance, ECS service (scale to 1).
# RDS must be available before ECS can connect; we wait for it.

set -e
REGION="${AWS_REGION:-eu-central-1}"
ECS_DESIRED_COUNT="${ECS_DESIRED_COUNT:-1}"

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

echo "Scaling ECS service to $ECS_DESIRED_COUNT..."
aws ecs update-service \
  --cluster octacard-staging-cluster \
  --service octacard-staging-service \
  --desired-count "$ECS_DESIRED_COUNT" \
  --region "$REGION" \
  --force-new-deployment \
  --output text --query 'service.deployments[0].status'

echo "=== Staging resources started ==="
