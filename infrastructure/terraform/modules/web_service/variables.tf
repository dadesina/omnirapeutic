variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "ecs_cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "private_app_subnet_ids" {
  description = "Private app subnet IDs for ECS tasks"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  type        = string
}

variable "task_execution_role_arn" {
  description = "IAM role ARN for ECS task execution"
  type        = string
}

variable "task_role_arn" {
  description = "IAM role ARN for ECS tasks"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for web container image"
  type        = string
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

variable "api_url" {
  description = "URL of the API service"
  type        = string
}

variable "app_url" {
  description = "Public URL of the web application"
  type        = string
}

variable "http_listener_arn" {
  description = "ARN of ALB HTTP listener"
  type        = string
}

variable "https_listener_arn" {
  description = "ARN of ALB HTTPS listener"
  type        = string
  default     = ""
}

variable "api_target_group_arn" {
  description = "ARN of API target group for staging routing"
  type        = string
}

variable "desired_count" {
  description = "Desired number of web tasks"
  type        = number
  default     = 1
}

variable "enable_staging_routing" {
  description = "Enable host-based routing for staging subdomains"
  type        = bool
  default     = false
}

variable "web_domain" {
  description = "Domain name for web application (e.g., staging.omnirapeutic.com)"
  type        = string
  default     = ""
}

variable "api_domain" {
  description = "Domain name for API (e.g., api.staging.omnirapeutic.com)"
  type        = string
  default     = ""
}
