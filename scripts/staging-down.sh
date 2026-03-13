#!/usr/bin/env bash
# Stop staging resources to save costs.
# Run from project root: ./scripts/staging-down.sh
#
# Stops: ECS service (scale to 0), RDS instance.
# Note: ElastiCache Redis cannot be stopped (AWS limitation); it stays running.

set -e
REGION="${AWS_REGION:-eu-central-1}"

echo "=== Stopping staging resources (region: $REGION) ==="

echo "Scaling ECS service to 0..."
aws ecs update-service \
  --cluster octacard-staging-cluster \
  --service octacard-staging-service \
  --desired-count 0 \
  --region "$REGION" \
  --output text --query 'service.deployments[0].status'

echo "Stopping RDS instance..."
aws rds stop-db-instance \
  --db-instance-identifier octacard-staging-db \
  --region "$REGION" \
  --output text --query 'DBInstance.DBInstanceStatus'

echo "=== Staging resources stopped ==="
echo "Note: ElastiCache Redis (octacard-staging-redis) cannot be stopped."
echo "To bring staging back up, run: ./scripts/staging-up.sh"
