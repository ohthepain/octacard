#!/usr/bin/env bash
# Build and push Docker image to ECR for ECS deployment.
# Run from project root: ./scripts/docker-build-push.sh [staging|production]

set -e
ENV="${1:-staging}"
cd "$(dirname "$0")/.."

ECR_URL=$(cd terraform && terraform workspace select "$ENV" 2>/dev/null && terraform output -raw ecr_repository_url)

echo "Logging in to ECR..."
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin "${ECR_URL%/*}"

echo "Building image (linux/arm64 for Graviton)..."
docker build --platform linux/arm64 -t "$ECR_URL:$ENV" .

echo "Pushing image..."
docker push "$ECR_URL:$ENV"

echo "Forcing ECS service update..."
aws ecs update-service \
  --cluster "octacard-${ENV}-cluster" \
  --service "octacard-${ENV}-service" \
  --force-new-deployment \
  --region eu-central-1 \
  --output text --query 'service.deployments[0].status'

echo "Done. ECS will pull the new image and redeploy."
