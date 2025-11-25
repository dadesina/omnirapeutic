variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "alb_arn" {
  description = "ARN of the ALB to associate with WAF"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encrypting WAF logs"
  type        = string
}

variable "rate_limit" {
  description = "Rate limit for requests per IP (per 5 minutes)"
  type        = number
  default     = 2000
}

variable "enable_logging" {
  description = "Enable WAF logging to CloudWatch"
  type        = bool
  default     = true
}
