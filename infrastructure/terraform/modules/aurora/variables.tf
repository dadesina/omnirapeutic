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

variable "private_data_subnet_ids" {
  description = "Private data subnet IDs for Aurora"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to access Aurora"
  type        = list(string)
  default     = []
}

variable "database_name" {
  description = "Database name"
  type        = string
}

variable "master_username" {
  description = "Master username"
  type        = string
  sensitive   = true
}

variable "master_password" {
  description = "Master password"
  type        = string
  sensitive   = true
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.10"  # LTS version - stable for production
}

variable "min_capacity" {
  description = "Minimum ACU capacity"
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Maximum ACU capacity"
  type        = number
  default     = 4.0
}

variable "instance_count" {
  description = "Number of Aurora instances"
  type        = number
  default     = 1
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}
