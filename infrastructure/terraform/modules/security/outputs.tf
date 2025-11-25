output "kms_aurora_key_id" {
  description = "Aurora KMS key ID"
  value       = aws_kms_key.aurora.key_id
}

output "kms_aurora_key_arn" {
  description = "Aurora KMS key ARN"
  value       = aws_kms_key.aurora.arn
}

output "kms_s3_key_id" {
  description = "S3 KMS key ID"
  value       = aws_kms_key.s3.key_id
}

output "kms_s3_key_arn" {
  description = "S3 KMS key ARN"
  value       = aws_kms_key.s3.arn
}

output "kms_secrets_key_id" {
  description = "Secrets Manager KMS key ID"
  value       = aws_kms_key.secrets.key_id
}

output "kms_secrets_key_arn" {
  description = "Secrets Manager KMS key ARN"
  value       = aws_kms_key.secrets.arn
}

output "aurora_master_password_arn" {
  description = "Aurora master password secret ARN"
  value       = aws_secretsmanager_secret.aurora_master_password.arn
  sensitive   = true
}

output "aurora_master_password" {
  description = "Aurora master password value"
  value       = random_password.aurora_master.result
  sensitive   = true
}

output "supabase_jwt_secret_arn" {
  description = "Supabase JWT secret ARN"
  value       = aws_secretsmanager_secret.supabase_jwt.arn
  sensitive   = true
}

output "supabase_anon_key_arn" {
  description = "Supabase anon key secret ARN"
  value       = aws_secretsmanager_secret.supabase_anon_key.arn
  sensitive   = true
}

output "supabase_service_key_arn" {
  description = "Supabase service key secret ARN"
  value       = aws_secretsmanager_secret.supabase_service_key.arn
  sensitive   = true
}
