# Nginx Test Service for Infrastructure Validation
# This is a temporary service to validate Sprint 1 infrastructure
# Will be replaced with actual application services in later phases

# CloudWatch Log Group for Nginx
resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/ecs/${var.project_name}-production/nginx"
  retention_in_days = 7  # Short retention for test service

  tags = {
    Name    = "${var.project_name}-production-nginx-logs"
    Purpose = "Test service logs"
  }
}

# ECS Task Definition for Nginx
resource "aws_ecs_task_definition" "nginx" {
  family                   = "${var.project_name}-production-nginx"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"   # 0.25 vCPU
  memory                   = "512"   # 512 MB
  execution_role_arn       = module.ecs.task_execution_role_arn
  task_role_arn            = module.ecs.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "nginx"
      image     = "nginx:alpine"
      essential = true

      portMappings = [
        {
          containerPort = 80
          protocol      = "tcp"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.nginx.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "nginx"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-production-nginx-task"
    Purpose = "Infrastructure validation"
  }
}

# ECS Service for Nginx
resource "aws_ecs_service" "nginx" {
  name            = "${var.project_name}-production-nginx"
  cluster         = module.ecs.cluster_arn
  task_definition = aws_ecs_task_definition.nginx.arn
  desired_count   = 2  # High availability

  launch_type = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_app_subnet_ids
    security_groups  = [module.ecs.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = module.alb.default_target_group_arn
    container_name   = "nginx"
    container_port   = 80
  }

  # Allow external changes without Terraform diff
  lifecycle {
    ignore_changes = [desired_count]
  }

  # Wait for ALB to be ready
  depends_on = [module.alb]

  tags = {
    Name    = "${var.project_name}-production-nginx-service"
    Purpose = "Infrastructure validation"
  }
}

# Output for easy access to service information
output "nginx_service_name" {
  description = "Nginx service name"
  value       = aws_ecs_service.nginx.name
}

output "nginx_task_definition" {
  description = "Nginx task definition ARN"
  value       = aws_ecs_task_definition.nginx.arn
}
