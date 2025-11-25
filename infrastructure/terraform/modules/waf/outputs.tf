output "web_acl_id" {
  description = "WAF WebACL ID"
  value       = aws_wafv2_web_acl.main.id
}

output "web_acl_arn" {
  description = "WAF WebACL ARN"
  value       = aws_wafv2_web_acl.main.arn
}

output "web_acl_name" {
  description = "WAF WebACL name"
  value       = aws_wafv2_web_acl.main.name
}

output "log_group_name" {
  description = "CloudWatch log group name for WAF logs"
  value       = var.enable_logging ? aws_cloudwatch_log_group.waf[0].name : ""
}
