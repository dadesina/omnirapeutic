output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

# Bastion Module Outputs

output "bastion_instance_id" {
  description = "Bastion host instance ID"
  value       = module.bastion.instance_id
}

output "bastion_connection_command" {
  description = "Command to connect to bastion via SSM"
  value       = module.bastion.connection_command
}

output "aurora_cluster_endpoint" {
  description = "Aurora cluster endpoint"
  value       = module.aurora.cluster_endpoint
  sensitive   = true
}

output "aurora_database_name" {
  description = "Aurora database name"
  value       = module.aurora.database_name
}

output "kms_keys" {
  description = "KMS key ARNs"
  value = {
    aurora  = module.security.kms_aurora_key_arn
    s3      = module.security.kms_s3_key_arn
    secrets = module.security.kms_secrets_key_arn
  }
}

# Security Module Outputs

output "cloudtrail_arn" {
  description = "CloudTrail ARN"
  value       = module.cloudtrail.trail_arn
}

output "cloudtrail_s3_bucket" {
  description = "CloudTrail S3 bucket name"
  value       = module.cloudtrail.s3_bucket_name
}

output "config_recorder_id" {
  description = "AWS Config Recorder ID"
  value       = module.config.config_recorder_id
}

output "config_conformance_pack_arn" {
  description = "HIPAA Conformance Pack ARN"
  value       = module.config.conformance_pack_arn
}

output "guardduty_detector_id" {
  description = "GuardDuty Detector ID"
  value       = module.guardduty.detector_id
}

output "alarms_sns_topic_arn" {
  description = "SNS Topic ARN for CloudWatch Alarms"
  value       = module.alarms.sns_topic_arn
}

# ECR Module Outputs

output "ecr_repository_urls" {
  description = "Map of ECR repository names to URLs"
  value       = module.ecr.repository_urls
}

# ECS Module Outputs

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = module.ecs.cluster_arn
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN"
  value       = module.ecs.task_execution_role_arn
}

# ALB Module Outputs

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = module.alb.alb_arn
}

output "alb_target_group_arn" {
  description = "Default ALB target group ARN"
  value       = module.alb.default_target_group_arn
}

# WAF Module Outputs

output "waf_web_acl_id" {
  description = "WAF WebACL ID"
  value       = module.waf.web_acl_id
}

output "waf_web_acl_arn" {
  description = "WAF WebACL ARN"
  value       = module.waf.web_acl_arn
}

output "waf_log_group" {
  description = "WAF CloudWatch log group name"
  value       = module.waf.log_group_name
}
