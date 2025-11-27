# Security Module - KMS Keys and Secrets Manager

# KMS Key for Aurora Encryption
resource "aws_kms_key" "aurora" {
  description             = "KMS key for Aurora PostgreSQL encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name    = "${var.project_name}-${var.environment}-aurora-kms"
    Purpose = "Aurora Database Encryption"
  }
}

resource "aws_kms_alias" "aurora" {
  name          = "alias/${var.project_name}-${var.environment}-aurora"
  target_key_id = aws_kms_key.aurora.key_id
}

# KMS Key for S3 Encryption
resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 bucket encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name    = "${var.project_name}-${var.environment}-s3-kms"
    Purpose = "S3 Bucket Encryption"
  }
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${var.project_name}-${var.environment}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

# KMS Key for Secrets Manager
resource "aws_kms_key" "secrets" {
  description             = "KMS key for Secrets Manager encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudTrail to encrypt logs"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = [
          "kms:GenerateDataKey*",
          "kms:DecryptDataKey"
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:aws:cloudtrail:*:${data.aws_caller_identity.current.account_id}:trail/*"
          }
        }
      },
      {
        Sid    = "Allow Config to use the key"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow GuardDuty to use the key"
        Effect = "Allow"
        Principal = {
          Service = "guardduty.amazonaws.com"
        }
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow SNS to use the key"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-${var.environment}-secrets-kms"
    Purpose = "Secrets Manager Encryption"
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.project_name}-${var.environment}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Random password for Aurora master user
# Aurora password restrictions: no '/', '@', '"', ' ' characters
resource "random_password" "aurora_master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}:;<>,.?"
}

# Secrets Manager - Aurora Master Password
resource "aws_secretsmanager_secret" "aurora_master_password" {
  name                    = "${var.project_name}/${var.environment}/aurora/master-password"
  description             = "Aurora PostgreSQL master password"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-aurora-master-password"
  }
}

resource "aws_secretsmanager_secret_version" "aurora_master_password" {
  secret_id     = aws_secretsmanager_secret.aurora_master_password.id
  secret_string = random_password.aurora_master.result
}

# Random JWT secret for Supabase
resource "random_password" "supabase_jwt" {
  length  = 64
  special = false
}

# Secrets Manager - Supabase JWT Secret
resource "aws_secretsmanager_secret" "supabase_jwt" {
  name                    = "${var.project_name}/${var.environment}/supabase/jwt-secret"
  description             = "Supabase JWT secret key"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-supabase-jwt"
  }
}

resource "aws_secretsmanager_secret_version" "supabase_jwt" {
  secret_id     = aws_secretsmanager_secret.supabase_jwt.id
  secret_string = random_password.supabase_jwt.result
}

# Random anon key for Supabase
resource "random_password" "supabase_anon_key" {
  length  = 64
  special = false
}

# Secrets Manager - Supabase Anon Key
resource "aws_secretsmanager_secret" "supabase_anon_key" {
  name                    = "${var.project_name}/${var.environment}/supabase/anon-key"
  description             = "Supabase anonymous key"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-supabase-anon-key"
  }
}

resource "aws_secretsmanager_secret_version" "supabase_anon_key" {
  secret_id     = aws_secretsmanager_secret.supabase_anon_key.id
  secret_string = random_password.supabase_anon_key.result
}

# Random service role key for Supabase
resource "random_password" "supabase_service_key" {
  length  = 64
  special = false
}

# Secrets Manager - Supabase Service Key
resource "aws_secretsmanager_secret" "supabase_service_key" {
  name                    = "${var.project_name}/${var.environment}/supabase/service-key"
  description             = "Supabase service role key"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-supabase-service-key"
  }
}

resource "aws_secretsmanager_secret_version" "supabase_service_key" {
  secret_id     = aws_secretsmanager_secret.supabase_service_key.id
  secret_string = random_password.supabase_service_key.result
}
