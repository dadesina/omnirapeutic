output "detector_id" {
  description = "GuardDuty Detector ID"
  value       = aws_guardduty_detector.main.id
}

output "detector_arn" {
  description = "GuardDuty Detector ARN"
  value       = aws_guardduty_detector.main.arn
}

output "s3_bucket_name" {
  description = "S3 bucket name for GuardDuty findings"
  value       = aws_s3_bucket.guardduty.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN for GuardDuty findings"
  value       = aws_s3_bucket.guardduty.arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for GuardDuty alerts"
  value       = aws_sns_topic.guardduty_alerts.arn
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for GuardDuty"
  value       = aws_cloudwatch_log_group.guardduty.name
}
