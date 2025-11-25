variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "repository_names" {
  description = "List of ECR repository names to create"
  type        = list(string)
  default     = ["api", "web", "worker"]
}

variable "kms_key_arn" {
  description = "KMS key ARN for ECR encryption"
  type        = string
}
