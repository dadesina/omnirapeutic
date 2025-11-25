# Web Service Module - ECS Fargate Service for Omnirapeutic Frontend

# CloudWatch Log Group for Web Service
resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project_name}-${var.environment}/web"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-${var.environment}-web-logs"
    Environment = var.environment
  }
}

# ECS Task Definition for Web
resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project_name}-${var.environment}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"   # 0.25 vCPU
  memory                   = "512"   # 512 MB
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name  = "web"
    image = "${var.ecr_repository_url}:${var.image_tag}"

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "NEXT_PUBLIC_API_URL", value = var.api_url },
      { name = "NEXT_PUBLIC_APP_URL", value = var.app_url }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.web.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "web"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name        = "${var.project_name}-${var.environment}-web-task"
    Environment = var.environment
  }
}

# ALB Target Group for Web
resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-${var.environment}-web-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
    protocol            = "HTTP"
  }

  deregistration_delay = 30

  tags = {
    Name        = "${var.project_name}-${var.environment}-web-tg"
    Environment = var.environment
  }
}

# ALB Listener Rule for Web (host-based routing for staging.omnirapeutic.com)
resource "aws_lb_listener_rule" "web_staging" {
  count        = var.enable_staging_routing ? 1 : 0
  listener_arn = var.https_listener_arn != "" ? var.https_listener_arn : var.http_listener_arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    host_header {
      values = [var.web_domain]
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-web-rule"
    Environment = var.environment
  }
}

# ALB Listener Rule for API with staging subdomain (host-based routing for api.staging.omnirapeutic.com)
resource "aws_lb_listener_rule" "api_staging" {
  count        = var.enable_staging_routing ? 1 : 0
  listener_arn = var.https_listener_arn != "" ? var.https_listener_arn : var.http_listener_arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = var.api_target_group_arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-api-staging-rule"
    Environment = var.environment
  }
}

# ECS Service for Web
resource "aws_ecs_service" "web" {
  name            = "${var.project_name}-${var.environment}-web"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_app_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  # Ensure the listener rule is created before the service
  depends_on = [aws_lb_listener_rule.web_staging]

  tags = {
    Name        = "${var.project_name}-${var.environment}-web-service"
    Environment = var.environment
  }
}
