# Bastion Host Module - SSM-Enabled Database Access

# Data source for latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group for Bastion Host
resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-${var.environment}-bastion-sg"
  description = "Security group for bastion host"
  vpc_id      = var.vpc_id

  # Allow outbound PostgreSQL to Aurora
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "PostgreSQL to Aurora"
  }

  # Allow outbound HTTPS for package updates
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS for package updates"
  }

  # Allow outbound HTTP for package updates
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP for package updates"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-bastion-sg"
  }
}

# IAM Role for Bastion Host
resource "aws_iam_role" "bastion" {
  name = "${var.project_name}-${var.environment}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-bastion-role"
  }
}

# Attach SSM Managed Policy for Session Manager
resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# IAM Policy for Secrets Manager Access
resource "aws_iam_role_policy" "bastion_secrets" {
  name = "${var.project_name}-${var.environment}-bastion-secrets-policy"
  role = aws_iam_role.bastion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.aurora_secret_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = var.kms_key_arn
      }
    ]
  })
}

# IAM Policy for S3 Access (for deployment scripts and migrations)
resource "aws_iam_role_policy" "bastion_s3" {
  name = "${var.project_name}-${var.environment}-bastion-s3-policy"
  role = aws_iam_role.bastion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.cloudtrail_bucket_arn,
          "${var.cloudtrail_bucket_arn}/*"
        ]
      }
    ]
  })
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "bastion" {
  name = "${var.project_name}-${var.environment}-bastion-profile"
  role = aws_iam_role.bastion.name

  tags = {
    Name = "${var.project_name}-${var.environment}-bastion-profile"
  }
}

# Bastion Host EC2 Instance
resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.bastion.id]
  iam_instance_profile   = aws_iam_instance_profile.bastion.name

  metadata_options {
    http_tokens                 = "required"  # IMDSv2 required
    http_put_response_hop_limit = 1
    http_endpoint               = "enabled"
  }

  user_data = <<-EOF
    #!/bin/bash
    # Update system
    dnf update -y

    # Install PostgreSQL 15 client
    dnf install -y postgresql15

    # Install AWS CLI v2 (if not present)
    if ! command -v aws &> /dev/null; then
      curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
      dnf install -y unzip
      unzip awscliv2.zip
      ./aws/install
      rm -rf aws awscliv2.zip
    fi

    # Create helper script for database connection
    cat > /usr/local/bin/connect-db <<'SCRIPT'
    #!/bin/bash
    # Get database credentials from Secrets Manager
    SECRET=$(aws secretsmanager get-secret-value --secret-id ${var.aurora_secret_arn} --query SecretString --output text)
    DB_HOST=$(echo $SECRET | jq -r '.host // "${var.aurora_endpoint}"')
    DB_USER=$(echo $SECRET | jq -r '.username // "postgres"')
    DB_NAME=$(echo $SECRET | jq -r '.dbname // "${var.database_name}"')

    echo "Connecting to database..."
    echo "Host: $DB_HOST"
    echo "User: $DB_USER"
    echo "Database: $DB_NAME"
    echo ""

    # Install jq if not present
    if ! command -v jq &> /dev/null; then
      dnf install -y jq
    fi

    # Get password and connect
    DB_PASS=$(echo $SECRET | jq -r '.password')
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME
    SCRIPT

    chmod +x /usr/local/bin/connect-db

    # Create README in home directory
    cat > /home/ec2-user/README.txt <<'README'
    ==========================================
    Omnirapeutic Bastion Host
    ==========================================

    This bastion host provides secure access to the Aurora PostgreSQL database.

    QUICK START:
    ------------
    To connect to the database:
      $ connect-db

    Or manually:
      $ psql -h <aurora-endpoint> -U postgres -d omnirapeutic

    INSTALL pgAudit EXTENSION:
    --------------------------
    1. Connect to database: connect-db
    2. Run: CREATE EXTENSION IF NOT EXISTS pgaudit;
    3. Configure: ALTER SYSTEM SET pgaudit.log = 'all';
    4. Restart Aurora from AWS Console

    USEFUL COMMANDS:
    ----------------
    - List databases: \l
    - List tables: \dt
    - Describe table: \d table_name
    - Quit psql: \q

    SECURITY NOTE:
    --------------
    This instance has no SSH access. All connections are through
    AWS Systems Manager Session Manager for full audit logging.

    ==========================================
    README

    chown ec2-user:ec2-user /home/ec2-user/README.txt
  EOF

  tags = {
    Name        = "${var.project_name}-${var.environment}-bastion"
    Environment = var.environment
    Purpose     = "Database Access"
    HIPAA       = "true"
  }
}
