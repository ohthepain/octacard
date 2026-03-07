#!/usr/bin/env bash
# Bootstrap state bucket and DynamoDB via AWS CLI (avoids Terraform S3 provider bug).
# Run from project root: ./scripts/bootstrap-aws.sh

set -e
REGION="${AWS_REGION:-eu-central-1}"
BUCKET="octacard-tf-state"
TABLE="octacard-terraform-locks"

echo "=== Bootstrap state bucket + DynamoDB in $REGION ==="

if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  echo "Bucket $BUCKET already exists"
else
  echo "Creating bucket $BUCKET..."
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
  aws s3api put-bucket-versioning --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$BUCKET" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}
      }]
    }'
  echo "Bucket created"
fi

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" 2>/dev/null; then
  echo "Table $TABLE already exists"
else
  echo "Creating DynamoDB table $TABLE..."
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"
  echo "Waiting for table to be active..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "Table created"
fi

echo "=== Bootstrap complete ==="
