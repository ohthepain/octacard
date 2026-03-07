environment = "production"
aws_region   = "eu-central-1"

db_username = "octacard"
# db_password = "..."       # Pass via: TF_VAR_db_password=xxx
# better_auth_secret = "..." # Pass via: TF_VAR_better_auth_secret=xxx

ecs_cpu           = 512
ecs_memory        = 1024
ecs_desired_count = 1

cors_allowed_origins = [
  "https://*.vercel.app",
  "https://octacard.vercel.app",
  "https://octacard.app"
]
