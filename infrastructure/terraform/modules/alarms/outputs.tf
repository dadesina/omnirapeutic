output "sns_topic_arn" {
  description = "SNS topic ARN for alarms"
  value       = aws_sns_topic.alarms.arn
}

output "sns_topic_name" {
  description = "SNS topic name for alarms"
  value       = aws_sns_topic.alarms.name
}

output "aurora_cpu_alarm_arn" {
  description = "Aurora CPU alarm ARN"
  value       = length(aws_cloudwatch_metric_alarm.aurora_cpu) > 0 ? aws_cloudwatch_metric_alarm.aurora_cpu[0].arn : ""
}

output "aurora_connections_alarm_arn" {
  description = "Aurora connections alarm ARN"
  value       = length(aws_cloudwatch_metric_alarm.aurora_connections) > 0 ? aws_cloudwatch_metric_alarm.aurora_connections[0].arn : ""
}

output "cost_alarm_arn" {
  description = "Cost alarm ARN"
  value       = aws_cloudwatch_metric_alarm.estimated_charges.arn
}
