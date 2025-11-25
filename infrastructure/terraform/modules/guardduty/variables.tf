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

variable "enable_kubernetes_protection" {
  description = "Enable Kubernetes audit logs protection"
  type        = bool
  default     = false
}

variable "enable_malware_protection" {
  description = "Enable malware protection for EC2"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email address for GuardDuty alerts"
  type        = string
  default     = ""
}
