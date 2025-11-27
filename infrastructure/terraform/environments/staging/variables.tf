variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "omnirapeutic"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "aurora_database_name" {
  description = "Aurora database name"
  type        = string
  default     = "omnirapeutic"
}

variable "aurora_master_username" {
  description = "Aurora master username"
  type        = string
  default     = "postgres"
  sensitive   = true
}

variable "aurora_min_capacity" {
  description = "Minimum Aurora ACU capacity"
  type        = number
  default     = 0.5
}

variable "aurora_max_capacity" {
  description = "Maximum Aurora ACU capacity"
  type        = number
  default     = 4.0
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for production resources"
  type        = bool
  default     = true
}
