terraform {
  backend "s3" {
    bucket         = "omnirapeutic-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "omnirapeutic-terraform-locks"
    encrypt        = true
  }
}
