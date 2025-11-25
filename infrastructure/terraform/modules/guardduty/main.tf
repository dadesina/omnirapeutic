# GuardDuty Module - Threat Detection

# Enable GuardDuty
resource "aws_guardduty_detector" "main" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = var.enable_kubernetes_protection
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = var.enable_malware_protection
        }
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-guardduty"
    Environment = var.environment
    HIPAA       = "true"
  }
}

# S3 Bucket for GuardDuty Findings
resource "aws_s3_bucket" "guardduty" {
  bucket = "${var.project_name}-${var.environment}-guardduty-findings"

  tags = {
    Name    = "${var.project_name}-${var.environment}-guardduty-findings"
    Purpose = "GuardDuty Findings Export"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "guardduty" {
  bucket = aws_s3_bucket.guardduty.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "guardduty" {
  bucket = aws_s3_bucket.guardduty.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "guardduty" {
  bucket = aws_s3_bucket.guardduty.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket Policy for GuardDuty
resource "aws_s3_bucket_policy" "guardduty" {
  bucket = aws_s3_bucket.guardduty.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowGuardDutyPutObject"
        Effect = "Allow"
        Principal = {
          Service = "guardduty.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.guardduty.arn}/*"
      },
      {
        Sid    = "AllowGuardDutyGetBucketLocation"
        Effect = "Allow"
        Principal = {
          Service = "guardduty.amazonaws.com"
        }
        Action   = "s3:GetBucketLocation"
        Resource = aws_s3_bucket.guardduty.arn
      }
    ]
  })
}

# KMS Key Policy for GuardDuty
data "aws_kms_key" "guardduty" {
  key_id = var.kms_key_arn
}

# SNS Topic for GuardDuty Alerts
resource "aws_sns_topic" "guardduty_alerts" {
  name              = "${var.project_name}-${var.environment}-guardduty-alerts"
  kms_master_key_id = var.kms_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-guardduty-alerts"
  }
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "guardduty_alerts" {
  arn = aws_sns_topic.guardduty_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowGuardDutyPublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.guardduty_alerts.arn
      }
    ]
  })
}

# EventBridge Rule for High Severity Findings
resource "aws_cloudwatch_event_rule" "guardduty_high_severity" {
  name        = "${var.project_name}-${var.environment}-guardduty-high-severity"
  description = "Capture GuardDuty high severity findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [7, 7.0, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8, 8.0, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9]
    }
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-guardduty-high-severity"
  }
}

# EventBridge Target for High Severity to SNS
resource "aws_cloudwatch_event_target" "guardduty_high_severity_sns" {
  rule      = aws_cloudwatch_event_rule.guardduty_high_severity.name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.guardduty_alerts.arn
}

# EventBridge Rule for Medium Severity Findings
resource "aws_cloudwatch_event_rule" "guardduty_medium_severity" {
  name        = "${var.project_name}-${var.environment}-guardduty-medium-severity"
  description = "Capture GuardDuty medium severity findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [4, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5, 5.0, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6, 6.0, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9]
    }
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-guardduty-medium-severity"
  }
}

# EventBridge Target for Medium Severity to SNS
resource "aws_cloudwatch_event_target" "guardduty_medium_severity_sns" {
  rule      = aws_cloudwatch_event_rule.guardduty_medium_severity.name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.guardduty_alerts.arn
}

# GuardDuty Publishing Destination (export findings to S3)
resource "aws_guardduty_publishing_destination" "main" {
  detector_id     = aws_guardduty_detector.main.id
  destination_arn = aws_s3_bucket.guardduty.arn
  kms_key_arn     = var.kms_key_arn

  depends_on = [aws_s3_bucket_policy.guardduty]
}

# GuardDuty Filter for Crypto Mining
resource "aws_guardduty_filter" "crypto_mining" {
  name        = "${var.project_name}-${var.environment}-crypto-mining"
  action      = "ARCHIVE"
  detector_id = aws_guardduty_detector.main.id
  rank        = 1

  finding_criteria {
    criterion {
      field  = "type"
      equals = ["CryptoCurrency:EC2/BitcoinTool.B!DNS"]
    }
  }
}

# GuardDuty Threat Intel Set (optional - for custom threat feeds)
# Uncomment if you have custom threat intelligence feeds
# resource "aws_guardduty_threatintelset" "custom" {
#   activate    = true
#   detector_id = aws_guardduty_detector.main.id
#   format      = "TXT"
#   location    = "s3://${var.threat_intel_bucket}/threat-list.txt"
#   name        = "${var.project_name}-${var.environment}-threat-intel"
# }

# CloudWatch Log Group for GuardDuty Findings
resource "aws_cloudwatch_log_group" "guardduty" {
  name              = "/aws/guardduty/${var.project_name}-${var.environment}"
  retention_in_days = 90

  tags = {
    Name = "${var.project_name}-${var.environment}-guardduty-logs"
  }
}
