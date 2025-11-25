output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.api.arn
}

output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.api.name
}

output "service_id" {
  description = "ID of the ECS service"
  value       = aws_ecs_service.api.id
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.api.arn
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.api.name
}
