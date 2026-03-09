terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    # Single backend; use workspaces for staging/production: terraform init -backend-config=backend.hcl
    bucket = "octacard-tf-state"
    key    = "terraform.tfstate"
    region = "eu-central-1"
  }
}

locals {
  environment = var.environment
  project     = "octacard"
  name_prefix = "${local.project}-${local.environment}"
  # SES config set: explicit var, or per-environment (octacard-production, octacard-staging)
  ses_configuration_set_name = var.ses_configuration_set != "" ? var.ses_configuration_set : local.name_prefix
}

# Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = local.project
      Environment = local.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront requires ACM certs in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = local.project
      Environment = local.environment
      ManagedBy   = "terraform"
    }
  }
}

# Shared network (1 VPC, 1 NAT) - apply terraform/network/ first
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket         = "octacard-tf-state"
    key            = "network/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "octacard-terraform-locks"
  }
  workspace = "default"
}

locals {
  vpc_id            = data.terraform_remote_state.network.outputs.vpc_id
  public_subnet_ids = data.terraform_remote_state.network.outputs.public_subnet_ids
}

# Security group: ALB
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = local.vpc_id
  description = "ALB for ${local.name_prefix}"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name_prefix}-alb" }
}

# Security group: ECS tasks
resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${local.name_prefix}-ecs-"
  vpc_id      = local.vpc_id
  description = "ECS tasks for ${local.name_prefix}"

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name_prefix}-ecs" }
}

# Security group: RDS (Postgres 5432)
resource "aws_security_group" "db" {
  name_prefix = "${local.name_prefix}-db-"
  vpc_id      = local.vpc_id
  description = "Postgres for ${local.name_prefix}"

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name_prefix}-db" }
}

# Security group: ElastiCache Redis (6379)
resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  vpc_id      = local.vpc_id
  description = "Redis for ${local.name_prefix}"

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name_prefix}-redis" }
}

# DB subnet group (RDS, 2+ AZs)
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = local.public_subnet_ids
  tags       = { Name = "${local.name_prefix}-db-subnets" }
}

# ElastiCache subnet group (Redis)
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnets"
  subnet_ids = local.public_subnet_ids
}

# S3 bucket for uploads (required)
resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name_prefix}-uploads"

  tags = {
    Name = "${local.name_prefix}-uploads"
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
  # AWS doesn't allow changing Enabled→Disabled; use Enabled for both
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage

  db_name  = "octacard"
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  publicly_accessible    = false

  backup_retention_period = local.environment == "production" ? 7 : 1
  multi_az                = local.environment == "production"

  skip_final_snapshot     = local.environment != "production"
  final_snapshot_identifier = local.environment == "production" ? "${local.name_prefix}-db-final" : null

  tags = { Name = "${local.name_prefix}-db" }
}

# ElastiCache Redis (session cache)
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  tags = { Name = "${local.name_prefix}-redis" }
}

# ECR Repository
resource "aws_ecr_repository" "app" {
  name                 = "${local.name_prefix}-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "${local.name_prefix}-ecr" }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name_prefix}-app"
  retention_in_days = 7
  tags              = { Name = "${local.name_prefix}-logs" }
}

# IAM: ECS Task Execution
resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
  tags = { Name = "${local.name_prefix}-ecs-execution" }
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-ecs-execution-secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = concat(
        [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.redis_url.arn,
          aws_secretsmanager_secret.better_auth_secret.arn
        ],
        var.google_client_id != "" && var.google_client_secret != "" ? [
          aws_secretsmanager_secret.google_client_id[0].arn,
          aws_secretsmanager_secret.google_client_secret[0].arn
        ] : []
      )
    }]
  })
}

# IAM: ECS Task (S3 access via task role)
resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
  tags = { Name = "${local.name_prefix}-ecs-task" }
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${local.name_prefix}-ecs-task-s3"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.uploads.arn}/*"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_ses" {
  name = "${local.name_prefix}-ecs-task-ses"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
    }]
  })
}

# Secrets Manager (lifecycle: don't delete on destroy - secrets are cheap, deletion is slow)
resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.name_prefix}/database-url"
  tags = { Name = "${local.name_prefix}-database-url" }
  lifecycle { prevent_destroy = true }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.db_username}:${urlencode(var.db_password)}@${aws_db_instance.postgres.endpoint}/octacard"
  depends_on   = [aws_db_instance.postgres]
  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_secretsmanager_secret" "redis_url" {
  name = "${local.name_prefix}/redis-url"
  tags = { Name = "${local.name_prefix}-redis-url" }
  lifecycle { prevent_destroy = true }
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
}

resource "aws_secretsmanager_secret" "better_auth_secret" {
  name = "${local.name_prefix}/better-auth-secret"
  tags = { Name = "${local.name_prefix}-better-auth-secret" }
  lifecycle { prevent_destroy = true }
}

resource "aws_secretsmanager_secret_version" "better_auth_secret" {
  secret_id     = aws_secretsmanager_secret.better_auth_secret.id
  secret_string = var.better_auth_secret
}

resource "aws_secretsmanager_secret" "google_client_id" {
  count  = var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0
  name   = "${local.name_prefix}/google-client-id"
  tags   = { Name = "${local.name_prefix}-google-client-id" }
  lifecycle { prevent_destroy = true }
}

resource "aws_secretsmanager_secret_version" "google_client_id" {
  count         = var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.google_client_id[0].id
  secret_string = var.google_client_id
}

resource "aws_secretsmanager_secret" "google_client_secret" {
  count  = var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0
  name   = "${local.name_prefix}/google-client-secret"
  tags   = { Name = "${local.name_prefix}-google-client-secret" }
  lifecycle { prevent_destroy = true }
}

resource "aws_secretsmanager_secret_version" "google_client_secret" {
  count         = var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.google_client_secret[0].id
  secret_string = var.google_client_secret
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = { Name = "${local.name_prefix}-cluster" }
}

# ALB
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids
  tags               = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "${local.name_prefix}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200"
  }
  tags = { Name = "${local.name_prefix}-tg" }
}

# ACM Certificate in us-east-1 (required for CloudFront)
resource "aws_acm_certificate" "cloudfront" {
  count                    = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  provider                 = aws.us_east_1
  domain_name              = var.domain_name
  subject_alternative_names = var.domain_aliases
  validation_method        = "DNS"

  lifecycle { create_before_destroy = true }
  tags = { Name = "${local.name_prefix}-cloudfront-cert" }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.cloudfront[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count                   = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# CloudFront distribution (when domain configured)
resource "aws_cloudfront_distribution" "main" {
  count    = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  enabled  = true
  comment  = "${local.name_prefix} app"
  aliases  = concat([var.domain_name], var.domain_aliases)

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]

    forwarded_values {
      query_string = true
      headers      = ["Host", "Origin", "Authorization"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront[0].certificate_arn
    ssl_support_method      = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = { Name = "${local.name_prefix}-cdn" }
}

# Route 53: A records point to CloudFront (not ALB)
resource "aws_route53_record" "main" {
  count          = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id        = var.route53_zone_id
  name           = var.domain_name
  type           = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# Route 53: A records for domain aliases (e.g. www)
resource "aws_route53_record" "aliases" {
  for_each = var.domain_name != "" && var.route53_zone_id != "" ? toset(var.domain_aliases) : toset([])

  zone_id         = var.route53_zone_id
  name            = replace(each.value, ".${var.domain_name}", "") # "www.octacard.live" -> "www"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ALB: HTTP only (CloudFront terminates HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ECS Task Definition (Graviton/ARM64 for better price-performance)
resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name_prefix}-app"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family  = "LINUX"
  }

  container_definitions = jsonencode([{
    name      = "${local.name_prefix}-app"
    image     = "${aws_ecr_repository.app.repository_url}:${local.environment}"
    essential = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "S3_BUCKET", value = aws_s3_bucket.uploads.id },
      { name = "BETTER_AUTH_URL", value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}" },
      { name = "BETTER_AUTH_TRUSTED_ORIGINS", value = var.domain_name != "" ? join(",", [for d in concat([var.domain_name], var.domain_aliases) : "https://${d}"]) : "" },
      { name = "SES_FROM_EMAIL", value = var.ses_from_email },
      { name = "SES_CONFIGURATION_SET", value = local.ses_configuration_set_name }
    ]

    secrets = concat(
      [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
        { name = "BETTER_AUTH_SECRET", valueFrom = aws_secretsmanager_secret.better_auth_secret.arn }
      ],
      var.google_client_id != "" && var.google_client_secret != "" ? [
        { name = "GOOGLE_CLIENT_ID", valueFrom = aws_secretsmanager_secret.google_client_id[0].arn },
        { name = "GOOGLE_CLIENT_SECRET", valueFrom = aws_secretsmanager_secret.google_client_secret[0].arn }
      ] : []
    )

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "${local.name_prefix}-task" }
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.public_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "${local.name_prefix}-app"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]
  tags       = { Name = "${local.name_prefix}-service" }
}

# Outputs
output "s3_bucket_name" {
  value       = aws_s3_bucket.uploads.id
  description = "S3 bucket name for uploads"
}

output "s3_bucket_arn" {
  value       = aws_s3_bucket.uploads.arn
  description = "S3 bucket ARN"
}

output "database_url" {
  value       = "postgresql://${var.db_username}:${urlencode(var.db_password)}@${aws_db_instance.postgres.endpoint}/octacard"
  description = "Postgres connection string (DATABASE_URL)"
  sensitive   = true
}

output "database_host" {
  value       = aws_db_instance.postgres.address
  description = "RDS host (for apps that need host/port separately)"
}

output "redis_url" {
  value       = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
  description = "Redis connection string (REDIS_URL)"
}

output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "ALB DNS name (use when domain not configured)"
}

output "app_url" {
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
  description = "App URL (HTTPS via CloudFront when domain configured, else HTTP ALB DNS)"
}

output "cloudfront_domain" {
  value       = var.domain_name != "" && var.route53_zone_id != "" ? aws_cloudfront_distribution.main[0].domain_name : null
  description = "CloudFront distribution domain (when domain configured)"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "ECR repository URL for Docker push"
}

output "auth_superadmin_emails" {
  value       = var.auth_superadmin_emails
  description = "Superadmin emails"
}

output "ses_from_email" {
  value       = var.ses_from_email
  description = "SES from email"
}

output "ses_configuration_set" {
  value       = local.ses_configuration_set_name
  description = "SES configuration set"
}

# SES Configuration Set (optional - for event publishing)
resource "aws_sesv2_configuration_set" "main" {
  count                   = local.ses_configuration_set_name != "" ? 1 : 0
  configuration_set_name  = local.ses_configuration_set_name
  reputation_options {
    reputation_metrics_enabled = true
  }
  delivery_options {
    tls_policy = "REQUIRE"
  }
}

# Domain identity (verify octacard.live so you can send from no-reply@octacard.live)
# Uses Easy DKIM - omit dkim_signing_attributes or use next_signing_key_length only
resource "aws_sesv2_email_identity" "domain" {
  count = var.domain_name != "" ? 1 : 0

  email_identity         = var.domain_name
  configuration_set_name = local.ses_configuration_set_name != "" ? local.ses_configuration_set_name : null

  # Wait for config set to exist before attaching (avoids SES eventual consistency 404)
  depends_on = [aws_sesv2_configuration_set.main]

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}
