terraform {
  backend "s3" {
    bucket         = "omnirapeutic-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "omnirapeutic-terraform-locks"
    encrypt        = true
  }
}
