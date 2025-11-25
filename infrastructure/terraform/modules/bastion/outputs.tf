output "instance_id" {
  description = "Bastion host instance ID"
  value       = aws_instance.bastion.id
}

output "instance_private_ip" {
  description = "Bastion host private IP address"
  value       = aws_instance.bastion.private_ip
}

output "security_group_id" {
  description = "Bastion host security group ID"
  value       = aws_security_group.bastion.id
}

output "iam_role_name" {
  description = "Bastion host IAM role name"
  value       = aws_iam_role.bastion.name
}

output "iam_role_arn" {
  description = "Bastion host IAM role ARN"
  value       = aws_iam_role.bastion.arn
}

output "connection_command" {
  description = "Command to connect to bastion via SSM"
  value       = "aws ssm start-session --target ${aws_instance.bastion.id}"
}
