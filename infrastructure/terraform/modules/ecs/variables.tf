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

variable "service_names" {
  description = "List of ECS service names for log groups"
  type        = list(string)
  default     = ["api", "web", "worker"]
}

variable "secrets_arn_prefix" {
  description = "ARN prefix for Secrets Manager secrets"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for secrets decryption"
  type        = string
}
