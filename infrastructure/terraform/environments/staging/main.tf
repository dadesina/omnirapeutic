# Staging Environment Configuration

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

locals {
  environment = "staging"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = local.environment
      ManagedBy   = "Terraform"
      HIPAA       = "true"
    }
  }
}

# Data source for staging secrets created by security module
data "aws_secretsmanager_secret_version" "aurora_password" {
  secret_id = "omnirapeutic/staging/aurora/master-password"
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = local.environment
  vpc_cidr           = var.vpc_cidr
  # Staging Change: Use 2 AZs for cost savings
  availability_zones = slice(var.availability_zones, 0, 2)
}

# Security Module (KMS + Secrets)
module "security" {
  source = "../../modules/security"

  project_name = var.project_name
  environment  = local.environment
}

# Aurora Module
module "aurora" {
  source = "../../modules/aurora"

  project_name               = var.project_name
  environment                = local.environment
  vpc_id                     = module.vpc.vpc_id
  private_data_subnet_ids    = module.vpc.private_data_subnet_ids
  allowed_security_group_ids = []

  database_name   = var.aurora_database_name
  master_username = var.aurora_master_username
  # Staging Change: Use pre-existing secret fetched via data source
  master_password = data.aws_secretsmanager_secret_version.aurora_password.secret_string
  engine_version  = "15.10"
  min_capacity    = var.aurora_min_capacity
  # Staging Change: Reduce max capacity for cost savings
  max_capacity = 4
  instance_count = 1
  kms_key_arn    = module.security.kms_aurora_key_arn
  # Staging Change: Disable deletion protection
  enable_deletion_protection = false

  depends_on = [module.security]
}

# Bastion Module
module "bastion" {
  source = "../../modules/bastion"

  project_name          = var.project_name
  environment           = local.environment
  vpc_id                = module.vpc.vpc_id
  vpc_cidr              = var.vpc_cidr
  subnet_id             = module.vpc.private_app_subnet_ids[0]
  aurora_endpoint       = module.aurora.cluster_endpoint
  # Staging Change: Use security module output for full ARN with suffix
  aurora_secret_arn     = module.security.aurora_master_password_arn
  database_name         = var.aurora_database_name
  kms_key_arn           = module.security.kms_secrets_key_arn
  cloudtrail_bucket_arn = module.cloudtrail.s3_bucket_arn

  depends_on = [module.aurora]
}

# Security Group Rule to allow Bastion access to Aurora
resource "aws_security_group_rule" "aurora_from_bastion" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.aurora.security_group_id
  source_security_group_id = module.bastion.security_group_id
  description              = "PostgreSQL access from bastion host"
}

# ECR Module
module "ecr" {
  source = "../../modules/ecr"

  project_name     = var.project_name
  environment      = local.environment
  repository_names = ["api", "web", "worker"]
  kms_key_arn      = module.security.kms_s3_key_arn
}

# ECS Module
module "ecs" {
  source = "../../modules/ecs"

  project_name  = var.project_name
  environment   = local.environment
  vpc_id        = module.vpc.vpc_id
  vpc_cidr      = var.vpc_cidr
  service_names = ["api", "web", "worker"]
  # Staging Change: Update secrets ARN prefix to use 'staging'
  secrets_arn_prefix = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}/${local.environment}"
  kms_key_arn        = module.security.kms_secrets_key_arn
}

# ALB Module
module "alb" {
  source = "../../modules/alb"

  project_name      = var.project_name
  environment       = local.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  certificate_arn   = ""
  kms_key_arn       = module.security.kms_s3_key_arn
  # Staging Change: Disable deletion protection
  enable_deletion_protection = false
}

# WAF Module
module "waf" {
  source = "../../modules/waf"

  project_name = var.project_name
  environment  = local.environment
  alb_arn      = module.alb.alb_arn
  kms_key_arn  = module.security.kms_secrets_key_arn
  # Staging Change: Reduce rate limit for non-production traffic
  rate_limit     = 500
  enable_logging = false

  depends_on = [module.alb]
}

# Security Group Rule to allow ECS tasks access to Aurora
resource "aws_security_group_rule" "aurora_from_ecs" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.aurora.security_group_id
  source_security_group_id = module.ecs.ecs_security_group_id
  description              = "PostgreSQL access from ECS tasks"
}

# Security Group Rule to allow ALB to reach ECS tasks
resource "aws_security_group_rule" "ecs_from_alb" {
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  security_group_id        = module.ecs.ecs_security_group_id
  source_security_group_id = module.alb.alb_security_group_id
  description              = "Traffic from ALB to ECS tasks"
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# CloudTrail Module
module "cloudtrail" {
  source = "../../modules/cloudtrail"

  project_name          = var.project_name
  environment           = local.environment
  kms_key_arn           = module.security.kms_secrets_key_arn
  is_organization_trail = false
}

# AWS Config Module
module "config" {
  source = "../../modules/config"

  project_name = var.project_name
  environment  = local.environment
  kms_key_arn  = module.security.kms_secrets_key_arn
}

# GuardDuty Module
module "guardduty" {
  source = "../../modules/guardduty"

  project_name                 = var.project_name
  environment                  = local.environment
  kms_key_arn                  = module.security.kms_secrets_key_arn
  enable_kubernetes_protection = false
  enable_malware_protection    = true
}

# CloudWatch Alarms Module
module "alarms" {
  source = "../../modules/alarms"

  project_name      = var.project_name
  environment       = local.environment
  kms_key_arn       = module.security.kms_secrets_key_arn
  aurora_cluster_id = module.aurora.cluster_id
  nat_gateway_ids   = module.vpc.nat_gateway_ids
  vpc_id            = module.vpc.vpc_id
  # Staging Change: Reduce cost threshold for alerts
  cost_threshold = 500

  # ALB Monitoring
  alb_arn_suffix          = module.alb.alb_arn != "" ? split("/", module.alb.alb_arn)[1] : ""
  target_group_arn_suffix = module.alb.default_target_group_arn != "" ? split(":", module.alb.default_target_group_arn)[5] : ""

  # ECS Monitoring
  ecs_cluster_name = module.ecs.cluster_name
  # Staging Change: Update service name for monitoring
  ecs_service_name = "${var.project_name}-${local.environment}-api"

  # WAF Monitoring
  waf_web_acl_name = module.waf.web_acl_name

  # API Log Group for BTG Alarms
  # Staging Change: Update log group name for monitoring
  api_log_group_name = "/ecs/${var.project_name}-${local.environment}/api"

  depends_on = [module.aurora, module.vpc, module.alb, module.ecs, module.waf]
}

# API Service Module
module "api_service" {
  source = "../../modules/api_service"

  project_name            = var.project_name
  environment             = local.environment
  aws_region              = var.aws_region
  vpc_id                  = module.vpc.vpc_id
  ecs_cluster_id          = module.ecs.cluster_id
  private_app_subnet_ids  = module.vpc.private_app_subnet_ids
  ecs_security_group_id   = module.ecs.ecs_security_group_id
  task_execution_role_arn = module.ecs.task_execution_role_arn
  task_role_arn           = module.ecs.task_role_arn
  ecr_repository_url      = module.ecr.repository_urls["api"]
  image_tag               = "staging"
  aurora_endpoint         = module.aurora.cluster_endpoint
  # Staging Change: Use security module outputs for full ARNs with suffix
  db_password_secret_arn = module.security.aurora_master_password_arn
  # Staging Change: Use security module JWT secret ARN
  jwt_secret_arn    = module.security.supabase_jwt_secret_arn
  http_listener_arn = module.alb.http_listener_arn
  # Staging Change: Reduce task count for cost savings
  desired_count = 1

  depends_on = [module.ecs, module.alb, module.ecr]
}

# Route 53 Hosted Zone (existing)
data "aws_route53_zone" "main" {
  name = "omnirapeutic.com."
}

# HTTPS Listener for ALB
resource "aws_lb_listener" "https" {
  load_balancer_arn = module.alb.alb_arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = "arn:aws:acm:us-east-1:422475949365:certificate/424be5a4-9b34-491f-8261-597fc85697bc"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }

  tags = {
    Name        = "${var.project_name}-${local.environment}-https-listener"
    Environment = local.environment
  }
}

# Web Service Module (Staging)
module "web_service" {
  source = "../../modules/web_service"

  project_name            = var.project_name
  environment             = local.environment
  aws_region              = var.aws_region
  vpc_id                  = module.vpc.vpc_id
  ecs_cluster_id          = module.ecs.cluster_id
  private_app_subnet_ids  = module.vpc.private_app_subnet_ids
  ecs_security_group_id   = module.ecs.ecs_security_group_id
  task_execution_role_arn = module.ecs.task_execution_role_arn
  task_role_arn           = module.ecs.task_role_arn
  ecr_repository_url      = module.ecr.repository_urls["web"]
  image_tag               = "staging"
  api_url                 = "https://api.staging.omnirapeutic.com"
  app_url                 = "https://staging.omnirapeutic.com"
  http_listener_arn       = module.alb.http_listener_arn
  https_listener_arn      = aws_lb_listener.https.arn
  api_target_group_arn    = module.api_service.target_group_arn
  desired_count           = 1
  enable_staging_routing  = true
  web_domain              = "staging.omnirapeutic.com"
  api_domain              = "api.staging.omnirapeutic.com"

  depends_on = [module.ecs, module.alb, module.ecr, module.api_service]
}

# Route 53 A Record for staging.omnirapeutic.com
resource "aws_route53_record" "web_staging" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "staging.omnirapeutic.com"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = "Z35SXDOTRQ7X7K"
    evaluate_target_health = true
  }
}

# Route 53 A Record for api.staging.omnirapeutic.com
resource "aws_route53_record" "api_staging" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.staging.omnirapeutic.com"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = "Z35SXDOTRQ7X7K"
    evaluate_target_health = true
  }
}
