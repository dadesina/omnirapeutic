# Omnirapeutic Infrastructure

This directory contains Terraform infrastructure-as-code for the Omnirapeutic platform.

## Architecture Overview

```
Production Environment:
├── VPC (10.0.0.0/16)
│   ├── Public Subnets (3 AZs)
│   │   ├── NAT Gateways (2 for HA)
│   │   └── Application Load Balancer (Phase 2)
│   ├── Private App Subnets (3 AZs)
│   │   └── ECS Fargate Tasks (Phase 2)
│   └── Private Data Subnets (3 AZs)
│       ├── Aurora PostgreSQL Serverless v2
│       └── ElastiCache Redis (Phase 2)
├── Security
│   ├── KMS Keys (Aurora, S3, Secrets)
│   └── Secrets Manager
│       ├── Aurora master password
│       └── Supabase secrets (JWT, anon key, service key)
└── Monitoring
    ├── VPC Flow Logs
    └── CloudWatch Log Groups
```

## Prerequisites

1. **AWS Account Setup**
   - AWS Organization configured
   - AWS BAA signed (required for PHI)
   - IAM user/role with appropriate permissions

2. **Tools**
   - Terraform >= 1.5.0
   - AWS CLI configured
   - Git

3. **GitHub Secrets** (for CI/CD)
   - `AWS_ROLE_ARN`: IAM role for GitHub Actions OIDC

## Directory Structure

```
infrastructure/
├── terraform/
│   ├── modules/
│   │   ├── vpc/           # Multi-AZ VPC with public/private subnets
│   │   ├── aurora/        # Aurora PostgreSQL Serverless v2
│   │   ├── security/      # KMS keys and Secrets Manager
│   │   ├── ecs/           # ECS Fargate (Phase 2)
│   │   └── monitoring/    # CloudWatch dashboards (Phase 2)
│   └── environments/
│       ├── dev/
│       ├── staging/
│       └── production/
└── scripts/
    ├── setup.sh           # Initial setup script
    └── verify.sh          # Verification script
```

## Phase 1: Foundation (Weeks 1-2)

### Step 1: Initialize Terraform Backend (Optional but Recommended)

Create an S3 bucket for Terraform state:

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket omnirapeutic-terraform-state \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket omnirapeutic-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket omnirapeutic-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

Then uncomment the backend configuration in `main.tf`.

### Step 2: Deploy Production Infrastructure

```bash
cd infrastructure/terraform/environments/production

# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Apply the configuration
terraform apply
```

### Step 3: Verify Deployment

```bash
# Check VPC
aws ec2 describe-vpcs --filters "Name=tag:Project,Values=omnirapeutic"

# Check Aurora cluster
aws rds describe-db-clusters --db-cluster-identifier omnirapeutic-production

# Verify encryption
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].StorageEncrypted'

# Check secrets
aws secretsmanager list-secrets --filters Key=tag-key,Values=Name

# Test database connectivity (from bastion or local with VPN)
psql -h <aurora-endpoint> -U postgres -d omnirapeutic -c "SELECT version();"
```

## Outputs

After deployment, Terraform will output:

```
vpc_id                        = "vpc-xxxxx"
aurora_cluster_endpoint       = "omnirapeutic-production.cluster-xxxxx.us-east-1.rds.amazonaws.com"
aurora_database_name          = "omnirapeutic"
kms_keys = {
  aurora  = "arn:aws:kms:us-east-1:xxxxx:key/xxxxx"
  s3      = "arn:aws:kms:us-east-1:xxxxx:key/xxxxx"
  secrets = "arn:aws:kms:us-east-1:xxxxx:key/xxxxx"
}
```

## Security Checklist

- [x] VPC with private subnets for database
- [x] Aurora encryption at rest (KMS)
- [x] Secrets Manager for sensitive data
- [x] VPC Flow Logs enabled
- [x] CloudWatch logging enabled
- [x] Security groups with least privilege
- [x] Multi-AZ deployment for HA
- [x] Automated backups (35-day retention)
- [ ] AWS BAA signed (manual step)

## Cost Estimation

**Phase 1 Infrastructure (Production):**
- VPC & Networking: ~$150/month (2 NAT Gateways)
- Aurora Serverless v2: ~$600-800/month (0.5-4 ACU)
- Secrets Manager: ~$2/month (4 secrets)
- KMS: ~$3/month (3 keys)
- CloudWatch Logs: ~$50/month
- **Total: ~$800-1,000/month**

## Next Steps (Phase 2)

1. Deploy ECS Fargate cluster
2. Deploy Supabase containers (Kong, GoTrue, PostgREST, Realtime)
3. Deploy ElastiCache Redis
4. Deploy Application Load Balancer
5. Configure AWS WAF

## Troubleshooting

### Issue: Aurora cluster creation timeout

```bash
# Check cluster status
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Status'

# View cluster events
aws rds describe-events \
  --source-type db-cluster \
  --source-identifier omnirapeutic-production
```

### Issue: Terraform state locked

```bash
# Check lock table
aws dynamodb scan --table-name terraform-state-lock

# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

### Issue: Cannot connect to Aurora

1. Verify security group allows connection from your IP/security group
2. Check VPC routing tables
3. Verify Aurora cluster is in "available" state
4. Use bastion host or VPN to connect to private subnet

## Support

For issues or questions:
1. Check Terraform documentation: https://registry.terraform.io/providers/hashicorp/aws
2. Review AWS documentation: https://docs.aws.amazon.com/
3. See implementation plan: `/IMPLEMENTATION_PLAN.md`
