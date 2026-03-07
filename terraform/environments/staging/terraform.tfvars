environment = "staging"
aws_region  = "eu-central-1"

db_username = "octacard"
# db_password = "..."       # Pass via: TF_VAR_db_password=xxx
# better_auth_secret = "..." # Pass via: TF_VAR_better_auth_secret=xxx (openssl rand -hex 32)

ecs_cpu          = 256
ecs_memory       = 512
ecs_desired_count = 1

cors_allowed_origins = [
  "https://*.vercel.app",
  "https://octacard-staging.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]
