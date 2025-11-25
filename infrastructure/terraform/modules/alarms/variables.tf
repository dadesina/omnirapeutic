variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for SNS encryption"
  type        = string
}

variable "alert_email" {
  description = "Email address for alarm notifications"
  type        = string
  default     = ""
}

variable "aurora_cluster_id" {
  description = "Aurora cluster identifier"
  type        = string
  default     = ""
}

variable "nat_gateway_ids" {
  description = "List of NAT Gateway IDs to monitor"
  type        = list(string)
  default     = []
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
  default     = ""
}

variable "cost_threshold" {
  description = "Monthly cost threshold for billing alarm (USD)"
  type        = number
  default     = 1500
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metrics"
  type        = string
  default     = ""
}

variable "target_group_arn_suffix" {
  description = "Target Group ARN suffix for CloudWatch metrics"
  type        = string
  default     = ""
}

variable "ecs_cluster_name" {
  description = "ECS cluster name for monitoring"
  type        = string
  default     = ""
}

variable "ecs_service_name" {
  description = "ECS service name for monitoring"
  type        = string
  default     = ""
}

variable "waf_web_acl_name" {
  description = "WAF WebACL name for monitoring"
  type        = string
  default     = ""
}
