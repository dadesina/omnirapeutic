# CloudWatch Alarms Module - Monitoring and Alerting

# SNS Topic for Alarms
resource "aws_sns_topic" "alarms" {
  name              = "${var.project_name}-${var.environment}-alarms"
  kms_master_key_id = var.kms_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-alarms"
  }
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "alarms" {
  arn = aws_sns_topic.alarms.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.alarms.arn
      }
    ]
  })
}

# SNS Email Subscription (if email provided)
resource "aws_sns_topic_subscription" "alarm_email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ========================================
# Aurora PostgreSQL Alarms
# ========================================

# Aurora CPU Utilization
resource "aws_cloudwatch_metric_alarm" "aurora_cpu" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Aurora CPU utilization is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-cpu-alarm"
  }
}

# Aurora Database Connections
resource "aws_cloudwatch_metric_alarm" "aurora_connections" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Aurora database connections are too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-connections-alarm"
  }
}

# Aurora Free Local Storage
resource "aws_cloudwatch_metric_alarm" "aurora_storage" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeLocalStorage"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120  # 5 GB in bytes
  alarm_description   = "Aurora free local storage is low"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-storage-alarm"
  }
}

# Aurora Replication Lag (for read replicas)
resource "aws_cloudwatch_metric_alarm" "aurora_replication_lag" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "AuroraReplicaLag"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 1000  # 1 second in milliseconds
  alarm_description   = "Aurora replication lag is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-replication-lag-alarm"
  }
}

# Aurora Read Latency
resource "aws_cloudwatch_metric_alarm" "aurora_read_latency" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-read-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ReadLatency"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 0.1  # 100ms
  alarm_description   = "Aurora read latency is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-read-latency-alarm"
  }
}

# Aurora Write Latency
resource "aws_cloudwatch_metric_alarm" "aurora_write_latency" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-write-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "WriteLatency"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 0.1  # 100ms
  alarm_description   = "Aurora write latency is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-write-latency-alarm"
  }
}

# Aurora Serverless ACU Utilization
resource "aws_cloudwatch_metric_alarm" "aurora_acu_utilization" {
  count = var.aurora_cluster_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-aurora-acu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ServerlessDatabaseCapacity"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 3.5  # Alert when near max capacity (4 ACU)
  alarm_description   = "Aurora Serverless capacity is near maximum"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBClusterIdentifier = var.aurora_cluster_id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-acu-alarm"
  }
}

# ========================================
# NAT Gateway Alarms
# ========================================

# NAT Gateway Bytes Out (bandwidth monitoring)
resource "aws_cloudwatch_metric_alarm" "nat_gateway_bytes_out" {
  count = length(var.nat_gateway_ids)

  alarm_name          = "${var.project_name}-${var.environment}-nat-gateway-${count.index + 1}-bytes-out"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BytesOutToDestination"
  namespace           = "AWS/NATGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 5000000000  # 5 GB
  alarm_description   = "NAT Gateway bandwidth usage is high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    NatGatewayId = var.nat_gateway_ids[count.index]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-gateway-${count.index + 1}-alarm"
  }
}

# NAT Gateway Error Port Allocation
resource "aws_cloudwatch_metric_alarm" "nat_gateway_error_port_allocation" {
  count = length(var.nat_gateway_ids)

  alarm_name          = "${var.project_name}-${var.environment}-nat-gateway-${count.index + 1}-port-allocation-error"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ErrorPortAllocation"
  namespace           = "AWS/NATGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "NAT Gateway port allocation errors detected"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    NatGatewayId = var.nat_gateway_ids[count.index]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-gateway-${count.index + 1}-port-error-alarm"
  }
}

# ========================================
# VPC Flow Logs Alarms
# ========================================

# VPC Flow Logs Delivery Failures
resource "aws_cloudwatch_metric_alarm" "vpc_flow_logs_delivery_failure" {
  count = var.vpc_id != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-vpc-flow-logs-delivery-failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "IncomingLogEvents"
  namespace           = "AWS/Logs"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "VPC Flow Logs delivery failures detected"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    LogGroupName = "/aws/vpc/flowlogs/${var.project_name}-${var.environment}"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-vpc-flow-logs-alarm"
  }
}

# ========================================
# General Infrastructure Alarms
# ========================================

# Account-level Budget Alarm (via CloudWatch)
resource "aws_cloudwatch_metric_alarm" "estimated_charges" {
  alarm_name          = "${var.project_name}-${var.environment}-estimated-charges-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 21600  # 6 hours
  statistic           = "Maximum"
  threshold           = var.cost_threshold
  alarm_description   = "AWS estimated charges are above threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    Currency = "USD"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cost-alarm"
  }
}

# ============================================================================
# ALB Alarms
# ============================================================================

# ALB Target Response Time
resource "aws_cloudwatch_metric_alarm" "alb_target_response_time" {
  count               = var.alb_arn_suffix != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-alb-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 2.0  # 2 seconds
  alarm_description   = "ALB target response time is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-response-time"
  }
}

# ALB 5XX Errors
resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  count               = var.target_group_arn_suffix != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "ALB is receiving too many 5XX errors from targets"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    TargetGroup  = var.target_group_arn_suffix
    LoadBalancer = var.alb_arn_suffix
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-5xx-errors"
  }
}

# ALB Unhealthy Host Count
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  count               = var.target_group_arn_suffix != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "ALB has unhealthy targets"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    TargetGroup  = var.target_group_arn_suffix
    LoadBalancer = var.alb_arn_suffix
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-unhealthy-hosts"
  }
}

# ============================================================================
# ECS Alarms
# ============================================================================

# ECS Service CPU Utilization
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_utilization" {
  count               = var.ecs_service_name != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "ECS service CPU utilization is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-cpu"
  }
}

# ECS Service Memory Utilization
resource "aws_cloudwatch_metric_alarm" "ecs_memory_utilization" {
  count               = var.ecs_service_name != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "ECS service memory utilization is too high"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-memory"
  }
}

# ECS Service Running Task Count
resource "aws_cloudwatch_metric_alarm" "ecs_task_count_low" {
  count               = var.ecs_service_name != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-ecs-tasks-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "ECS service has no running tasks"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-tasks"
  }
}

# ============================================================================
# WAF Alarms
# ============================================================================

# WAF Blocked Requests
resource "aws_cloudwatch_metric_alarm" "waf_blocked_requests" {
  count               = var.waf_web_acl_name != "" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-waf-blocked-requests"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  alarm_description   = "WAF is blocking an unusual number of requests"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = var.waf_web_acl_name
    Region = "us-east-1"
    Rule   = "ALL"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-waf-blocked"
  }
}
