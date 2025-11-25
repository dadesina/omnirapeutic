variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
}

variable "is_organization_trail" {
  description = "Whether this is an organization trail"
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email address for CloudTrail alerts"
  type        = string
  default     = ""
}
