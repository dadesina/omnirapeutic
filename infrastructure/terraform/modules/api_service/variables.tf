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
  description = "ECR repository URL for API container image"
  type        = string
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

variable "aurora_endpoint" {
  description = "Aurora database cluster endpoint"
  type        = string
}

variable "db_password_secret_arn" {
  description = "ARN of database password secret in Secrets Manager"
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of JWT secret in Secrets Manager"
  type        = string
}

variable "http_listener_arn" {
  description = "ARN of ALB HTTP listener"
  type        = string
}

variable "desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}
