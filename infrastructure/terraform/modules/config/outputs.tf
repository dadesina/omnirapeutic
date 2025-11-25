output "config_recorder_id" {
  description = "AWS Config Recorder ID"
  value       = aws_config_configuration_recorder.main.id
}

output "config_recorder_arn" {
  description = "AWS Config Recorder ARN"
  value       = aws_config_configuration_recorder.main.role_arn
}

output "s3_bucket_name" {
  description = "S3 bucket name for Config logs"
  value       = aws_s3_bucket.config.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN for Config logs"
  value       = aws_s3_bucket.config.arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for Config alerts"
  value       = aws_sns_topic.config.arn
}

output "conformance_pack_arn" {
  description = "HIPAA Conformance Pack ARN"
  value       = aws_config_conformance_pack.hipaa_security.arn
}
