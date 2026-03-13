# Shared network: 1 VPC for both staging and production (no NAT)
# Apply once: cd network && terraform init && terraform apply

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "octacard-tf-state"
    key            = "network/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "octacard-terraform-locks"
  }
}

provider "aws" {
  region = "eu-central-1"
  default_tags {
    tags = { Project = "octacard", ManagedBy = "terraform", Shared = "network" }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "shared" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "octacard-shared-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.shared.id
  tags   = { Name = "octacard-shared-igw" }
}

# Public subnets (ALB, ECS, RDS) - 2 AZs
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.shared.id
  cidr_block              = cidrsubnet(aws_vpc.shared.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "octacard-shared-public-${count.index + 1}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.shared.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "octacard-shared-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

output "vpc_id" {
  value = aws_vpc.shared.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}
