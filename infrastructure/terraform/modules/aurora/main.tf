# Aurora PostgreSQL Serverless v2 Module

# DB Subnet Group
resource "aws_db_subnet_group" "aurora" {
  name       = "${var.project_name}-${var.environment}-aurora-subnet-group"
  subnet_ids = var.private_data_subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-subnet-group"
  }
}

# Security Group for Aurora
resource "aws_security_group" "aurora" {
  name        = "${var.project_name}-${var.environment}-aurora-sg"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = var.vpc_id

  # Allow PostgreSQL access from ECS tasks
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
    description     = "PostgreSQL access from ECS tasks"
  }

  # No outbound rules needed (database doesn't initiate connections)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound (required for managed service)"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-sg"
  }
}

# Aurora RDS Cluster
resource "aws_rds_cluster" "main" {
  cluster_identifier      = "${var.project_name}-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_mode             = "provisioned"
  engine_version          = var.engine_version
  database_name           = var.database_name
  master_username         = var.master_username
  master_password         = var.master_password

  # Serverless v2 scaling configuration
  serverlessv2_scaling_configuration {
    max_capacity = var.max_capacity
    min_capacity = var.min_capacity
  }

  # HIPAA Compliance Requirements
  storage_encrypted               = true
  kms_key_id                      = var.kms_key_arn
  backup_retention_period         = 35  # HIPAA requires long retention
  preferred_backup_window         = "03:00-04:00"
  enabled_cloudwatch_logs_exports = ["postgresql"]
  deletion_protection             = var.enable_deletion_protection

  # Network configuration
  db_subnet_group_name    = aws_db_subnet_group.aurora.name
  vpc_security_group_ids  = [aws_security_group.aurora.id]

  # Apply changes immediately in non-production
  apply_immediately = var.environment != "production"

  # Skip final snapshot for non-production
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.project_name}-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-cluster"
  }
}

# Aurora Instance (Serverless v2)
resource "aws_rds_cluster_instance" "main" {
  count              = var.instance_count
  identifier         = "${var.project_name}-${var.environment}-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  performance_insights_enabled = true
  performance_insights_kms_key_id = var.kms_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-instance-${count.index + 1}"
  }
}

# CloudWatch Log Group for PostgreSQL logs
resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/cluster/${aws_rds_cluster.main.cluster_identifier}/postgresql"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-postgresql-logs"
  }
}
