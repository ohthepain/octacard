bucket         = "octacard-tf-state"
key            = "terraform.tfstate"
region         = "eu-central-1"
encrypt        = true
dynamodb_table = "octacard-terraform-locks"
