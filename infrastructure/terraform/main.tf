terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Backend configuration for state management
  # Uncomment and configure after creating S3 bucket for state
   backend "s3" {
     bucket         = "omnirapeutic-terraform-state"
     key            = "infrastructure/terraform.tfstate"
     region         = "us-east-1"
     encrypt        = true
     dynamodb_table = "terraform-state-lock"
   }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Omnirapeutic"
      Environment = var.environment
      ManagedBy   = "Terraform"
      HIPAA       = "true"
    }
  }
}
