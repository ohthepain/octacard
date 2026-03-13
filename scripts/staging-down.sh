#!/usr/bin/env bash
# Stop staging resources to save costs.
# Run from project root: ./scripts/staging-down.sh
#
# Stops: ECS service (scale to 0), deletes ElastiCache Redis, stops RDS.
# Redis is cache-only; we delete and recreate on staging-up.

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

echo "Deleting ElastiCache Redis cluster (cache-only, recreated on staging-up)..."
if aws elasticache delete-cache-cluster \
  --cache-cluster-id octacard-staging-redis \
  --region "$REGION" \
  --output text --query 'CacheCluster.CacheClusterStatus' 2>/dev/null; then
  echo "Waiting for Redis deletion to complete..."
  aws elasticache wait cache-cluster-deleted \
    --cache-cluster-id octacard-staging-redis \
    --region "$REGION"
else
  echo "(Redis cluster already deleted or not found)"
fi

echo "Stopping RDS instance..."
aws rds stop-db-instance \
  --db-instance-identifier octacard-staging-db \
  --region "$REGION" \
  --output text --query 'DBInstance.DBInstanceStatus'

echo "=== Staging resources stopped ==="
echo "To bring staging back up, run: ./scripts/staging-up.sh"
