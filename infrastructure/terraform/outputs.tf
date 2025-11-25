output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "aurora_cluster_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = module.aurora.cluster_endpoint
  sensitive   = true
}

output "aurora_cluster_reader_endpoint" {
  description = "Aurora cluster reader endpoint"
  value       = module.aurora.cluster_reader_endpoint
  sensitive   = true
}

output "aurora_database_name" {
  description = "Aurora database name"
  value       = module.aurora.database_name
}

output "kms_key_arns" {
  description = "KMS key ARNs"
  value = {
    aurora  = module.security.kms_aurora_key_arn
    s3      = module.security.kms_s3_key_arn
    secrets = module.security.kms_secrets_key_arn
  }
}

output "aurora_security_group_id" {
  description = "Aurora security group ID"
  value       = module.aurora.security_group_id
}
