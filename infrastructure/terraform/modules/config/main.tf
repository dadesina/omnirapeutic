# AWS Config Module - HIPAA Compliance Monitoring

# S3 Bucket for AWS Config
resource "aws_s3_bucket" "config" {
  bucket = "${var.project_name}-${var.environment}-config-logs"

  tags = {
    Name    = "${var.project_name}-${var.environment}-config-logs"
    Purpose = "AWS Config Configuration History"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "config" {
  bucket = aws_s3_bucket.config.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket Policy for AWS Config
resource "aws_s3_bucket_policy" "config" {
  bucket = aws_s3_bucket.config.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSConfigBucketPermissionsCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.config.arn
      },
      {
        Sid    = "AWSConfigBucketExistenceCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.config.arn
      },
      {
        Sid    = "AWSConfigBucketPutObject"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.config.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

# IAM Role for AWS Config
resource "aws_iam_role" "config" {
  name = "${var.project_name}-${var.environment}-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-config-role"
  }
}

# Attach AWS managed policy for Config
resource "aws_iam_role_policy_attachment" "config" {
  role       = aws_iam_role.config.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

# Additional policy for S3 and SNS
resource "aws_iam_role_policy" "config" {
  name = "${var.project_name}-${var.environment}-config-policy"
  role = aws_iam_role.config.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketVersioning",
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = [
          aws_s3_bucket.config.arn,
          "${aws_s3_bucket.config.arn}/*"
        ]
      }
    ]
  })
}

# SNS Topic for Config notifications
resource "aws_sns_topic" "config" {
  name              = "${var.project_name}-${var.environment}-config-alerts"
  kms_master_key_id = var.kms_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-config-alerts"
  }
}

# AWS Config Recorder
resource "aws_config_configuration_recorder" "main" {
  name     = "${var.project_name}-${var.environment}-recorder"
  role_arn = aws_iam_role.config.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

# AWS Config Delivery Channel
resource "aws_config_delivery_channel" "main" {
  name           = "${var.project_name}-${var.environment}-delivery-channel"
  s3_bucket_name = aws_s3_bucket.config.id
  sns_topic_arn  = aws_sns_topic.config.arn

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

# Start the Config Recorder
resource "aws_config_configuration_recorder_status" "main" {
  name       = aws_config_configuration_recorder.main.name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.main]
}

# AWS Config Conformance Pack - HIPAA Security
resource "aws_config_conformance_pack" "hipaa_security" {
  name = "${var.project_name}-${var.environment}-hipaa-security"

  template_body = <<-EOT
    Resources:
      CloudTrailEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: cloudtrail-enabled
          Description: Checks if CloudTrail is enabled
          Source:
            Owner: AWS
            SourceIdentifier: CLOUD_TRAIL_ENABLED
      CloudTrailEncryptionEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: cloudtrail-encryption-enabled
          Description: Checks if CloudTrail logs are encrypted at rest using KMS
          Source:
            Owner: AWS
            SourceIdentifier: CLOUD_TRAIL_ENCRYPTION_ENABLED
      RDSEncryptionEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: rds-encryption-enabled
          Description: Checks if RDS instances are encrypted
          Source:
            Owner: AWS
            SourceIdentifier: RDS_STORAGE_ENCRYPTED
      RDSMultiAZ:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: rds-multi-az-support
          Description: Checks if RDS instances are configured for Multi-AZ
          Source:
            Owner: AWS
            SourceIdentifier: RDS_MULTI_AZ_SUPPORT
      S3BucketSSLRequestsOnly:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-ssl-requests-only
          Description: Checks if S3 buckets enforce SSL
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_SSL_REQUESTS_ONLY
      S3BucketPublicReadProhibited:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-public-read-prohibited
          Description: Checks if S3 buckets allow public read access
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      S3BucketPublicWriteProhibited:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-public-write-prohibited
          Description: Checks if S3 buckets allow public write access
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_PUBLIC_WRITE_PROHIBITED
      VPCFlowLogsEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: vpc-flow-logs-enabled
          Description: Checks if VPC Flow Logs are enabled
          Source:
            Owner: AWS
            SourceIdentifier: VPC_FLOW_LOGS_ENABLED
  EOT

  depends_on = [
    aws_config_configuration_recorder_status.main
  ]
}

# Config Rule - Encrypted Volumes
resource "aws_config_config_rule" "encrypted_volumes" {
  name        = "${var.project_name}-${var.environment}-encrypted-volumes"
  description = "Checks if EBS volumes are encrypted"

  source {
    owner             = "AWS"
    source_identifier = "ENCRYPTED_VOLUMES"
  }

  depends_on = [aws_config_configuration_recorder_status.main]
}

# Config Rule - Required Tags
resource "aws_config_config_rule" "required_tags" {
  name        = "${var.project_name}-${var.environment}-required-tags"
  description = "Checks if resources have required tags"

  source {
    owner             = "AWS"
    source_identifier = "REQUIRED_TAGS"
  }

  input_parameters = jsonencode({
    tag1Key = "Project"
    tag2Key = "Environment"
    tag3Key = "HIPAA"
  })

  depends_on = [aws_config_configuration_recorder_status.main]
}
