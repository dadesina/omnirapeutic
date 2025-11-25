# Omnirapeutic - Quick Start Guide

## Phase 1: Foundation (IMPLEMENTED)

Get your HIPAA-compliant infrastructure up and running in minutes.

---

## Prerequisites Setup

**IMPORTANT:** Complete all prerequisites before deploying infrastructure.

### Step 0: Install Tools & Configure AWS

```bash
# 1. Install prerequisites (Terraform, AWS CLI, Git)
./infrastructure/scripts/install-prerequisites.sh

# 2. Configure AWS credentials
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# 3. Verify prerequisites
./infrastructure/scripts/check-prerequisites.sh
```

**Detailed setup guide:** See `PREREQUISITES_SETUP_GUIDE.md` for complete instructions including:
- Tool installation for all platforms
- AWS account setup
- AWS BAA signing process (HIPAA compliance)
- Terraform remote state backend setup
- GitHub OIDC configuration
- Cost monitoring setup

### Prerequisites Checklist

```
[ ] AWS Account with admin access
[ ] AWS CLI installed and configured
[ ] Terraform >= 1.5.0 installed
[ ] AWS Business Associate Agreement (BAA) signed
[ ] Git installed
[ ] Terraform state backend created (S3 + DynamoDB)
[ ] AWS Budgets configured for cost monitoring
```

---

## Option 1: Automated Setup (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd omnirapeutic

# Run setup script
./infrastructure/scripts/setup.sh
```

The script will:
1. Check prerequisites
2. Prompt for environment selection
3. Verify AWS BAA is signed
4. Run Terraform plan
5. Deploy infrastructure
6. Verify deployment

---

## Option 2: Manual Setup

### Step 1: Initialize Terraform

```bash
cd infrastructure/terraform/environments/production
terraform init
```

### Step 2: Review Configuration

```bash
# Check what will be created
terraform plan
```

Expected resources:
- 1 VPC with 9 subnets (3 AZs x 3 tiers)
- 2 NAT Gateways
- 1 Aurora PostgreSQL Serverless v2 cluster
- 3 KMS keys
- 4 Secrets Manager secrets
- VPC Flow Logs

### Step 3: Deploy Infrastructure

```bash
terraform apply
```

Type `yes` to confirm.

Deployment takes approximately 10-15 minutes.

### Step 4: Verify Deployment

```bash
cd ../../../
./infrastructure/scripts/verify.sh
```

---

## Post-Deployment

### Save Outputs

```bash
cd infrastructure/terraform/environments/production
terraform output > ../../terraform-outputs.txt
```

### Test Aurora Connectivity

```bash
# Get Aurora endpoint
AURORA_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint)

# Get master password from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id omnirapeutic/production/aurora/master-password \
  --query SecretString \
  --output text

# Connect (requires VPN or bastion)
psql -h $AURORA_ENDPOINT -U postgres -d omnirapeutic
```

### Install pgAudit Extension

```sql
-- Connect to Aurora
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Verify installation
SELECT * FROM pg_extension WHERE extname='pgaudit';

-- Configure audit logging
ALTER SYSTEM SET pgaudit.log = 'READ, WRITE, DDL';
ALTER SYSTEM SET pgaudit.log_relation = ON;
SELECT pg_reload_conf();
```

---

## What's Deployed?

### Network Architecture

```
VPC (10.0.0.0/16)
├── Public Subnets (3 AZs)
│   ├── Internet Gateway
│   └── NAT Gateways (2 for HA)
├── Private App Subnets (3 AZs)
│   └── (Reserved for ECS - Phase 2)
└── Private Data Subnets (3 AZs)
    └── Aurora PostgreSQL Serverless v2
```

### Security

- All data encrypted at rest (KMS)
- All data encrypted in transit (TLS)
- VPC Flow Logs enabled
- 35-day backup retention
- Multi-AZ for high availability

### Credentials

All sensitive credentials stored in AWS Secrets Manager:
- Aurora master password
- Supabase JWT secret
- Supabase anon key
- Supabase service key

---

## Troubleshooting

### Issue: Cannot connect to Aurora

**Solution:** Aurora is in a private subnet. You need either:
1. VPN connection to VPC
2. Bastion host in public subnet
3. AWS Systems Manager Session Manager

### Issue: Terraform state locked

```bash
# View locks
aws dynamodb scan --table-name terraform-state-lock

# Force unlock
terraform force-unlock <LOCK_ID>
```

### Issue: Aurora creation timeout

Aurora takes 10-15 minutes to deploy. Check status:

```bash
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Status'
```

---

## Cost Estimate

**Monthly infrastructure cost:** $905-1,105

Breakdown:
- NAT Gateways: $150
- Aurora Serverless v2: $600-800
- KMS + Secrets: $5
- CloudWatch: $50
- Data transfer: $100

---

## Next Steps

Phase 1 complete! Proceed to:

**Phase 2: Supabase Self-Hosting** (Weeks 3-4)
- Deploy ECS Fargate cluster
- Deploy Supabase containers
- Deploy ElastiCache Redis
- Configure Application Load Balancer

See `IMPLEMENTATION_PLAN.md` for detailed Phase 2 instructions.

---

## Support

- Documentation: `infrastructure/README.md`
- Full implementation: `PHASE_1_IMPLEMENTATION_SUMMARY.md`
- Detailed plan: `IMPLEMENTATION_PLAN.md`
- Technology stack: `TECHNOLOGY_STACK_RECOMMENDATION.md`

---

## Security Reminders

- [ ] AWS BAA signed and documented
- [ ] Secrets Manager access restricted
- [ ] CloudTrail enabled for audit logging
- [ ] MFA enabled on AWS root account
- [ ] Least privilege IAM policies
- [ ] Regular security reviews scheduled

---

**Status:** Phase 1 Complete - Ready for Phase 2
