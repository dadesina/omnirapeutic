# Deployment Guide - Omnirapeutic Production Infrastructure

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Deployment](#initial-deployment)
3. [Application Deployment](#application-deployment)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Verification Steps](#verification-steps)
6. [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Required Tools

Install the following tools before beginning deployment:

```bash
# AWS CLI (>= 2.0)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Terraform (>= 1.5.0)
wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip
unzip terraform_1.5.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Session Manager Plugin
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"
sudo dpkg -i session-manager-plugin.deb

# Docker (for building images)
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

### AWS Access Configuration

```bash
# Configure AWS credentials
aws configure --profile omnirapeutic-production

# Verify access
aws sts get-caller-identity --profile omnirapeutic-production
```

### Required AWS Permissions

Your IAM user/role needs permissions for:
- VPC, Subnets, Route Tables, NAT Gateways, Internet Gateway
- EC2, ECS, ECR, ALB, Target Groups
- RDS Aurora, Parameter Groups, Subnet Groups
- IAM Roles, Policies, Instance Profiles
- KMS Keys, Secrets Manager
- CloudWatch Logs, Alarms, Metrics
- CloudTrail, AWS Config, GuardDuty
- WAF WebACLs and Rules
- S3 Buckets and Objects
- SNS Topics and Subscriptions

## Initial Deployment

### Step 1: Clone Infrastructure Repository

```bash
# Clone the repository
git clone <repository-url>
cd infrastructure/terraform/environments/production
```

### Step 2: Review Configuration Variables

Edit `terraform.tfvars` to customize your deployment:

```hcl
# terraform.tfvars
project_name = "omnirapeutic"
aws_region   = "us-east-1"

# Network Configuration
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Aurora Configuration
aurora_database_name  = "omnirapeutic"
aurora_master_username = "admin"
aurora_min_capacity    = 0.5
aurora_max_capacity    = 1.0

# Protection
enable_deletion_protection = true
```

### Step 3: Initialize Terraform

```bash
# Initialize Terraform (downloads providers)
terraform init

# Validate configuration
terraform validate
```

### Step 4: Plan Infrastructure Changes

```bash
# Generate execution plan
terraform plan -out=tfplan

# Review the plan carefully
# Verify all resources to be created
```

### Step 5: Deploy Infrastructure

```bash
# Apply the plan
terraform apply tfplan

# Deployment typically takes 15-20 minutes
# Aurora cluster creation is the longest operation
```

### Step 6: Capture Outputs

```bash
# Save all outputs to a file
terraform output > infrastructure-outputs.txt

# Key outputs to note:
terraform output alb_dns_name
terraform output bastion_instance_id
terraform output bastion_connection_command
terraform output ecs_cluster_name
terraform output waf_web_acl_id
```

## Application Deployment

### Step 1: Build Docker Images

```bash
# Navigate to application repository
cd /path/to/application

# Build API image
docker build -t omnirapeutic-api:latest -f Dockerfile.api .

# Build Web image
docker build -t omnirapeutic-web:latest -f Dockerfile.web .

# Build Worker image
docker build -t omnirapeutic-worker:latest -f Dockerfile.worker .
```

### Step 2: Push Images to ECR

```bash
# Get ECR login credentials
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# Get repository URLs
API_REPO=$(terraform output -raw ecr_repository_urls | jq -r '.api')
WEB_REPO=$(terraform output -raw ecr_repository_urls | jq -r '.web')
WORKER_REPO=$(terraform output -raw ecr_repository_urls | jq -r '.worker')

# Tag images
docker tag omnirapeutic-api:latest $API_REPO:latest
docker tag omnirapeutic-web:latest $WEB_REPO:latest
docker tag omnirapeutic-worker:latest $WORKER_REPO:latest

# Push images
docker push $API_REPO:latest
docker push $WEB_REPO:latest
docker push $WORKER_REPO:latest
```

### Step 3: Create ECS Task Definitions

Create task definition files for each service:

**api-task-definition.json**:
```json
{
  "family": "omnirapeutic-production-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "<task-execution-role-arn>",
  "taskRoleArn": "<task-role-arn>",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "<api-ecr-url>:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:omnirapeutic/production/database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/omnirapeutic-production/api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "api"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### Step 4: Register Task Definitions

```bash
# Create CloudWatch log groups
aws logs create-log-group --log-group-name /ecs/omnirapeutic-production/api --region us-east-1
aws logs create-log-group --log-group-name /ecs/omnirapeutic-production/web --region us-east-1
aws logs create-log-group --log-group-name /ecs/omnirapeutic-production/worker --region us-east-1

# Set retention (30 days for production)
aws logs put-retention-policy --log-group-name /ecs/omnirapeutic-production/api \
  --retention-in-days 30 --region us-east-1

# Register task definitions
aws ecs register-task-definition \
  --cli-input-json file://api-task-definition.json \
  --region us-east-1

aws ecs register-task-definition \
  --cli-input-json file://web-task-definition.json \
  --region us-east-1

aws ecs register-task-definition \
  --cli-input-json file://worker-task-definition.json \
  --region us-east-1
```

### Step 5: Create ALB Target Groups

```bash
# Get VPC ID
VPC_ID=$(terraform output -raw vpc_id)

# Create API target group
aws elbv2 create-target-group \
  --name omnirapeutic-prod-api \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-enabled \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region us-east-1

# Create Web target group
aws elbv2 create-target-group \
  --name omnirapeutic-prod-web \
  --protocol HTTP \
  --port 80 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-enabled \
  --health-check-path / \
  --health-check-interval-seconds 30 \
  --region us-east-1
```

### Step 6: Update ALB Listener Rules

```bash
# Get ALB listener ARN
ALB_ARN=$(terraform output -raw alb_arn)
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN \
  --query 'Listeners[0].ListenerArn' --output text --region us-east-1)

# Get target group ARNs
API_TG_ARN=$(aws elbv2 describe-target-groups --names omnirapeutic-prod-api \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region us-east-1)
WEB_TG_ARN=$(aws elbv2 describe-target-groups --names omnirapeutic-prod-web \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region us-east-1)

# Create listener rules
# API rule: /api/* → API target group
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 10 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=$API_TG_ARN \
  --region us-east-1

# Web rule: /* → Web target group (default)
aws elbv2 modify-listener \
  --listener-arn $LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$WEB_TG_ARN \
  --region us-east-1
```

### Step 7: Create ECS Services

```bash
# Get cluster ARN and subnet IDs
CLUSTER_ARN=$(terraform output -raw ecs_cluster_arn)
SUBNETS=$(terraform output -json vpc_id | jq -r '.private_app_subnet_ids | join(",")')
SG_ID=$(terraform output -raw ecs_security_group_id)

# Create API service
aws ecs create-service \
  --cluster $CLUSTER_ARN \
  --service-name omnirapeutic-production-api \
  --task-definition omnirapeutic-production-api \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$API_TG_ARN,containerName=api,containerPort=3000" \
  --health-check-grace-period-seconds 60 \
  --region us-east-1

# Create Web service
aws ecs create-service \
  --cluster $CLUSTER_ARN \
  --service-name omnirapeutic-production-web \
  --task-definition omnirapeutic-production-web \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$WEB_TG_ARN,containerName=web,containerPort=80" \
  --health-check-grace-period-seconds 60 \
  --region us-east-1

# Create Worker service (no load balancer)
aws ecs create-service \
  --cluster $CLUSTER_ARN \
  --service-name omnirapeutic-production-worker \
  --task-definition omnirapeutic-production-worker \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=DISABLED}" \
  --region us-east-1
```

## Post-Deployment Configuration

### Step 1: Configure Database

```bash
# Connect to bastion
BASTION_ID=$(terraform output -raw bastion_instance_id)
aws ssm start-session --target $BASTION_ID --region us-east-1

# Inside bastion session:
# Get database credentials from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id omnirapeutic/production/aurora-master-password \
  --region us-east-1 \
  --query SecretString --output text

# Connect to Aurora
AURORA_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint)
psql -h $AURORA_ENDPOINT -U admin -d omnirapeutic

# Run database migrations
# CREATE SCHEMA, CREATE TABLES, etc.
```

### Step 2: Install pgAudit Extension

```sql
-- Inside psql session
CREATE EXTENSION pgaudit;

-- Configure audit logging
ALTER SYSTEM SET pgaudit.log = 'all';
ALTER SYSTEM SET pgaudit.log_catalog = 'off';
ALTER SYSTEM SET pgaudit.log_parameter = 'on';

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'pgaudit';
```

### Step 3: Configure SNS Alarm Notifications

```bash
# Get SNS topic ARN
SNS_TOPIC=$(terraform output -raw alarms_sns_topic_arn)

# Subscribe email to alarms
aws sns subscribe \
  --topic-arn $SNS_TOPIC \
  --protocol email \
  --notification-endpoint ops-team@omnirapeutic.com \
  --region us-east-1

# Confirm subscription via email
```

### Step 4: Configure HTTPS (Optional)

```bash
# Request ACM certificate
aws acm request-certificate \
  --domain-name app.omnirapeutic.com \
  --validation-method DNS \
  --region us-east-1

# Add DNS validation records to Route53 or your DNS provider

# Wait for validation
aws acm wait certificate-validated \
  --certificate-arn <certificate-arn> \
  --region us-east-1

# Add HTTPS listener to ALB
CERT_ARN=<certificate-arn>
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$WEB_TG_ARN \
  --region us-east-1

# Redirect HTTP to HTTPS
aws elbv2 modify-listener \
  --listener-arn $LISTENER_ARN \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --region us-east-1
```

## Verification Steps

### Step 1: Infrastructure Health Checks

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api omnirapeutic-production-web \
  --region us-east-1

# Check task health
aws ecs list-tasks \
  --cluster omnirapeutic-production \
  --service-name omnirapeutic-production-api \
  --desired-status RUNNING \
  --region us-east-1

# Check ALB target health
aws elbv2 describe-target-health \
  --target-group-arn $API_TG_ARN \
  --region us-east-1
```

### Step 2: Application Testing

```bash
# Get ALB DNS name
ALB_DNS=$(terraform output -raw alb_dns_name)

# Test web endpoint
curl -I http://$ALB_DNS/

# Test API endpoint
curl http://$ALB_DNS/api/health

# Test with load
ab -n 1000 -c 10 http://$ALB_DNS/
```

### Step 3: Security Testing

```bash
# Test WAF rate limiting
for i in {1..3000}; do curl -s http://$ALB_DNS/ > /dev/null; done
# Should see 403 responses after hitting rate limit

# Check WAF metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=omnirapeutic-production-waf \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

### Step 4: Monitoring Validation

```bash
# Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --state-value ALARM \
  --region us-east-1

# View recent logs
aws logs tail /ecs/omnirapeutic-production/api --follow --region us-east-1
```

## Rollback Procedures

### Rollback ECS Service

```bash
# List previous task definition revisions
aws ecs list-task-definitions \
  --family-prefix omnirapeutic-production-api \
  --region us-east-1

# Update service to previous revision
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --task-definition omnirapeutic-production-api:N \
  --region us-east-1

# Monitor rollback
aws ecs wait services-stable \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --region us-east-1
```

### Rollback Infrastructure

```bash
# CAUTION: This will destroy resources
# Review the plan first
terraform plan -destroy

# Rollback specific module
terraform destroy -target=module.waf

# Full rollback (NOT recommended for production)
terraform destroy
```

### Database Rollback

```bash
# Restore from automated snapshot
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1

# Restore cluster from snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier omnirapeutic-production-restored \
  --snapshot-identifier <snapshot-id> \
  --engine aurora-postgresql \
  --region us-east-1
```

## Troubleshooting

See [Troubleshooting Guide](./troubleshooting.md) for common deployment issues and solutions.

## Next Steps

1. Configure custom domain with Route53
2. Set up CI/CD pipeline for automated deployments
3. Configure backup and disaster recovery procedures
4. Run load testing and performance tuning
5. Schedule security scanning and penetration testing

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial deployment guide |
