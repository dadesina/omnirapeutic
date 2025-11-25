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
  description = "General rate limit for requests per IP (per 5 minutes)"
  type        = number
  default     = 2000
}

variable "auth_rate_limit" {
  description = "Stricter rate limit for authentication endpoints per IP (per 5 minutes) - protects against brute-force attacks"
  type        = number
  default     = 100  # Recommended: 100 requests per 5 minutes for auth endpoints
}

variable "enable_logging" {
  description = "Enable WAF logging to CloudWatch"
  type        = bool
  default     = true
}
