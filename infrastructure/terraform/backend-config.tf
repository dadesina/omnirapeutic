terraform {
  backend "s3" {
    bucket         = ""
    key            = "infrastructure/production/terraform.tfstate"
    region         = ""
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
