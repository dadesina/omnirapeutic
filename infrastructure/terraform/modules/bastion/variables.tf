variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for bastion host (should be private subnet)"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for bastion host"
  type        = string
  default     = "t3.micro"
}

variable "aurora_endpoint" {
  description = "Aurora cluster endpoint"
  type        = string
}

variable "aurora_secret_arn" {
  description = "ARN of Aurora master password secret"
  type        = string
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "omnirapeutic"
}

variable "kms_key_arn" {
  description = "KMS key ARN for secrets decryption"
  type        = string
}

variable "cloudtrail_bucket_arn" {
  description = "ARN of CloudTrail S3 bucket for deployment artifacts"
  type        = string
}
