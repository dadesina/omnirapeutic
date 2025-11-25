output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.web.arn
}

output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.web.name
}

output "service_id" {
  description = "ID of the ECS service"
  value       = aws_ecs_service.web.id
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.web.arn
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.web.name
}

output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.web.name
}
