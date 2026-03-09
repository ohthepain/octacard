variable "environment" {
  description = "Environment name (staging or production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "cors_allowed_origins" {
  description = "CORS allowed origins for S3"
  type        = list(string)
  default     = ["https://*.vercel.app", "https://*.octacard.live"]
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "RDS max allocated storage for autoscaling (GB)"
  type        = number
  default     = 100
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "better_auth_secret" {
  description = "Better Auth secret (generate with: openssl rand -hex 32)"
  type        = string
  sensitive   = true
}

variable "ecs_cpu" {
  description = "ECS task CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256
}

variable "ecs_memory" {
  description = "ECS task memory (MB)"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "ECS service desired task count"
  type        = number
  default     = 1
}

variable "domain_name" {
  description = "Domain for HTTPS (e.g. staging.octacard.live). Required for File System Access API."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for domain_name (for ACM validation and A record)"
  type        = string
  default     = ""
}

variable "domain_aliases" {
  description = "Additional domain aliases (e.g. www.example.com). Must be in same Route53 zone. Adds to ACM cert and CloudFront."
  type        = list(string)
  default     = []
}

variable "auth_superadmin_emails" {
  description = "Superadmin emails"
  type        = list(string)
  default     = ["cremoni@gmail.com"]
}

variable "ses_from_email" {
  description = "SES from email"
  type        = string
  default     = "no-reply@octacard.live"
}

variable "ses_configuration_set" {
  description = "SES configuration set name. Empty = use name_prefix (octacard-{environment}). Set explicitly to share or use existing (e.g. octacard-live for production)."
  type        = string
  default     = ""
}
