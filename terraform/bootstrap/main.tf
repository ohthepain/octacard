# Bootstrap: creates S3 bucket and DynamoDB table for Terraform state.
# Run once: terraform init && terraform apply
# Then use in main terraform: terraform init -backend-config=environments/<env>/backend.hcl

terraform {
  required_version = ">= 1.0"

  required_providers {
    # Pin < 5.68 to avoid S3 bucket "Still creating" hang (hashicorp/terraform-provider-aws#39627)
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 5.68"
    }
  }

  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "${var.project_name}-terraform-state"

  tags = {
    Name = "${var.project_name}-terraform-state"
  }

  # S3 bucket creation is instant; fail fast if provider hangs (known bug in 5.68+)
  timeouts {
    create = "2m"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "${var.project_name}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-terraform-locks"
  }
}

output "state_bucket" {
  value       = aws_s3_bucket.terraform_state.id
  description = "S3 bucket for Terraform state"
}

output "lock_table" {
  value       = aws_dynamodb_table.terraform_locks.name
  description = "DynamoDB table for state locking"
}
