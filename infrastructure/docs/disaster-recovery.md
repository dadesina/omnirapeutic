# Disaster Recovery - Omnirapeutic Production Infrastructure

## Table of Contents

1. [DR Strategy Overview](#dr-strategy-overview)
2. [Backup Procedures](#backup-procedures)
3. [Recovery Procedures](#recovery-procedures)
4. [Testing & Validation](#testing--validation)
5. [Incident Scenarios](#incident-scenarios)
6. [DR Runbooks](#dr-runbooks)

## DR Strategy Overview

### Recovery Objectives

**Recovery Time Objective (RTO)**: 4 hours
- Time from disaster declaration to service restoration

**Recovery Point Objective (RPO)**: 5 minutes
- Maximum acceptable data loss

### DR Architecture

**Strategy**: Backup and Restore (Single Region)
- Aurora automated backups (5-minute point-in-time recovery)
- Manual snapshots before major changes
- Infrastructure as Code (Terraform) for rapid rebuild
- Multi-AZ deployment for high availability

**Future Enhancement**: Multi-Region Active-Passive
- Replicate Aurora to secondary region
- Cross-region backup replication
- Route53 health checks with automatic failover

### Disaster Scenarios Covered

1. Aurora database failure/corruption
2. Complete service outage (all ECS tasks down)
3. VPC/Networking failure
4. ALB failure
5. Regional AWS outage
6. Accidental resource deletion
7. Security breach/ransomware
8. Human error (bad deployment)

## Backup Procedures

### Aurora Database Backups

#### Automated Backups

```bash
# Verify automated backups are enabled
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].[BackupRetentionPeriod,PreferredBackupWindow]' \
  --region us-east-1

# Expected: [7, "03:00-04:00"] (7-day retention, 3-4 AM UTC backup window)
```

**Automated Backup Configuration**:
- Retention: 7 days
- Backup Window: 03:00-04:00 UTC (11 PM - 12 AM EST)
- Point-in-time recovery: Any time within retention period
- Stored in AWS-managed S3 (encrypted)

#### Manual Snapshots

```bash
# Create manual snapshot before major changes
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier omnirapeutic-prod-pre-migration-$(date +%Y%m%d-%H%M) \
  --db-cluster-identifier omnirapeutic-production \
  --tags Key=Purpose,Value=pre-migration Key=CreatedBy,Value=$(whoami) \
  --region us-east-1

# Monitor snapshot creation
aws rds describe-db-cluster-snapshots \
  --db-cluster-snapshot-identifier omnirapeutic-prod-pre-migration-* \
  --query 'DBClusterSnapshots[0].[Status,PercentProgress]' \
  --region us-east-1

# Wait for completion
aws rds wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier omnirapeutic-prod-pre-migration-20251124-1200 \
  --region us-east-1
```

**Manual Snapshot Schedule**:
- Before database migrations
- Before major schema changes
- Before critical deployments
- Weekly on Sundays (retained for 30 days)

#### List and Manage Snapshots

```bash
# List all snapshots
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusterSnapshots[].[DBClusterSnapshotIdentifier,SnapshotCreateTime,Status,SnapshotType]' \
  --output table \
  --region us-east-1

# Delete old manual snapshots (keep last 30 days)
OLD_SNAPSHOTS=$(aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier omnirapeutic-production \
  --snapshot-type manual \
  --query "DBClusterSnapshots[?SnapshotCreateTime<='$(date -u -d '30 days ago' +%Y-%m-%d)'].DBClusterSnapshotIdentifier" \
  --output text \
  --region us-east-1)

for snapshot in $OLD_SNAPSHOTS; do
  echo "Deleting snapshot: $snapshot"
  aws rds delete-db-cluster-snapshot \
    --db-cluster-snapshot-identifier $snapshot \
    --region us-east-1
done

# Copy snapshot to another region (DR strategy)
aws rds copy-db-cluster-snapshot \
  --source-db-cluster-snapshot-identifier arn:aws:rds:us-east-1:ACCOUNT:cluster-snapshot:omnirapeutic-prod-20251124 \
  --target-db-cluster-snapshot-identifier omnirapeutic-prod-20251124-dr \
  --source-region us-east-1 \
  --region us-west-2 \
  --kms-key-id <us-west-2-kms-key-id>
```

### Application Backups

#### ECR Image Retention

```bash
# Images are retained in ECR indefinitely
# Implement lifecycle policy for old images

cat > ecr-lifecycle-policy.json <<EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 20 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF

# Apply lifecycle policy
aws ecr put-lifecycle-policy \
  --repository-name omnirapeutic-production-api \
  --lifecycle-policy-text file://ecr-lifecycle-policy.json \
  --region us-east-1
```

#### ECS Task Definition Backups

```bash
# Task definitions are versioned automatically
# List all versions
aws ecs list-task-definitions \
  --family-prefix omnirapeutic-production-api \
  --region us-east-1

# Export current task definition
aws ecs describe-task-definition \
  --task-definition omnirapeutic-production-api \
  --query 'taskDefinition' \
  --region us-east-1 > task-definition-backup-$(date +%Y%m%d).json
```

### Infrastructure Backups

#### Terraform State

```bash
# Current: Local state file
# Backup terraform state regularly

# Create backup
cp terraform.tfstate terraform.tfstate.backup-$(date +%Y%m%d-%H%M)

# Store in secure location
aws s3 cp terraform.tfstate \
  s3://omnirapeutic-terraform-backups/production/terraform.tfstate-$(date +%Y%m%d-%H%M) \
  --sse aws:kms \
  --sse-kms-key-id <kms-key-id>

# Future: Migrate to S3 backend with versioning
terraform {
  backend "s3" {
    bucket         = "omnirapeutic-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "<kms-key-id>"
    dynamodb_table = "terraform-state-lock"
  }
}
```

#### Configuration Backups

```bash
# Export AWS Config snapshots
aws configservice deliver-config-snapshot \
  --delivery-channel-name default \
  --region us-east-1

# Backup Secrets Manager secrets metadata (not values!)
aws secretsmanager list-secrets \
  --filters Key=name,Values=omnirapeutic/production \
  --region us-east-1 > secrets-metadata-$(date +%Y%m%d).json
```

### Log Backups

```bash
# CloudWatch Logs are retained per log group settings
# Export logs to S3 for long-term archival

# Create export task
aws logs create-export-task \
  --log-group-name /ecs/omnirapeutic-production/api \
  --from $(date -d '7 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination omnirapeutic-logs-archive \
  --destination-prefix ecs-api-logs/$(date +%Y/%m) \
  --region us-east-1

# Check export status
aws logs describe-export-tasks \
  --region us-east-1
```

## Recovery Procedures

### Aurora Database Recovery

#### Restore from Automated Backup (Point-in-Time)

```bash
# 1. Identify restore point
# List available restore times
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].[EarliestRestorableTime,LatestRestorableTime]' \
  --region us-east-1

# 2. Restore to a new cluster (non-destructive)
aws rds restore-db-cluster-to-point-in-time \
  --source-db-cluster-identifier omnirapeutic-production \
  --db-cluster-identifier omnirapeutic-production-restored-$(date +%Y%m%d-%H%M) \
  --restore-to-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)Z \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name omnirapeutic-production-aurora-subnet-group \
  --kms-key-id <kms-key-arn> \
  --region us-east-1

# 3. Create instance in restored cluster
aws rds create-db-instance \
  --db-instance-identifier omnirapeutic-production-restored-instance-1 \
  --db-cluster-identifier omnirapeutic-production-restored-$(date +%Y%m%d-%H%M) \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --region us-east-1

# 4. Wait for cluster to be available
aws rds wait db-cluster-available \
  --db-cluster-identifier omnirapeutic-production-restored-$(date +%Y%m%d-%H%M) \
  --region us-east-1

# 5. Verify data integrity
RESTORED_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production-restored-$(date +%Y%m%d-%H%M) \
  --query 'DBClusters[0].Endpoint' \
  --output text \
  --region us-east-1)

psql -h $RESTORED_ENDPOINT -U admin -d omnirapeutic -c "SELECT COUNT(*) FROM users;"

# 6. Update application to use restored cluster
# Update ECS task definitions with new database endpoint
# OR promote restored cluster to replace production
```

#### Restore from Manual Snapshot

```bash
# 1. List available snapshots
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusterSnapshots[].[DBClusterSnapshotIdentifier,SnapshotCreateTime]' \
  --output table \
  --region us-east-1

# 2. Restore from specific snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier omnirapeutic-production-restored \
  --snapshot-identifier omnirapeutic-prod-pre-migration-20251124-1200 \
  --engine aurora-postgresql \
  --engine-version 15.10 \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name omnirapeutic-production-aurora-subnet-group \
  --kms-key-id <kms-key-arn> \
  --region us-east-1

# 3. Create serverless v2 instance
aws rds create-db-instance \
  --db-instance-identifier omnirapeutic-production-restored-instance-1 \
  --db-cluster-identifier omnirapeutic-production-restored \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --region us-east-1

# 4. Configure serverless scaling
aws rds modify-db-cluster \
  --db-cluster-identifier omnirapeutic-production-restored \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --apply-immediately \
  --region us-east-1
```

#### Promote Restored Cluster to Production

```bash
# 1. Take final snapshot of current production cluster
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier omnirapeutic-prod-final-before-failover-$(date +%Y%m%d-%H%M) \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1

# 2. Stop application traffic (scale ECS to 0 or delete services)
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --desired-count 0 \
  --region us-east-1

# 3. Rename cluster identifiers via console or:
# - Delete old production cluster
# - Rename restored cluster to production

# 4. Update DNS/endpoints if needed

# 5. Verify connectivity
psql -h <new-endpoint> -U admin -d omnirapeutic -c "SELECT version();"

# 6. Restart application services
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --desired-count 2 \
  --region us-east-1
```

### ECS Service Recovery

#### Restart All Services

```bash
# Force new deployment (rolling restart)
for service in api web worker; do
  echo "Restarting service: omnirapeutic-production-$service"
  aws ecs update-service \
    --cluster omnirapeutic-production \
    --service omnirapeutic-production-$service \
    --force-new-deployment \
    --region us-east-1
done

# Monitor deployment status
watch -n 5 'aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api omnirapeutic-production-web \
  --query "services[].[serviceName,desiredCount,runningCount,deployments[0].status]" \
  --output table \
  --region us-east-1'
```

#### Rollback to Previous Task Definition

```bash
# List task definition revisions
aws ecs list-task-definitions \
  --family-prefix omnirapeutic-production-api \
  --sort DESC \
  --max-items 10 \
  --region us-east-1

# Update service to previous revision
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --task-definition omnirapeutic-production-api:N-1 \
  --force-new-deployment \
  --region us-east-1
```

### Infrastructure Recovery

#### Recreate All Infrastructure from Terraform

```bash
# 1. Clone repository
git clone <repository-url>
cd infrastructure/terraform/environments/production

# 2. Initialize Terraform
terraform init

# 3. Import existing resources (if any survived)
# Example: Import VPC if it still exists
# terraform import module.vpc.aws_vpc.main vpc-xxxxx

# 4. Review planned changes
terraform plan

# 5. Apply infrastructure
terraform apply -auto-approve

# Deployment time: ~20 minutes
# Most time-consuming: Aurora cluster creation (10-15 min)
```

#### Recover Specific Module

```bash
# Recover only ALB
terraform apply -target=module.alb

# Recover only WAF
terraform apply -target=module.waf

# Recover only ECS
terraform apply -target=module.ecs
```

### Secrets Recovery

```bash
# If Secrets Manager secrets are deleted, restore from backup

# 1. Create new secret
aws secretsmanager create-secret \
  --name omnirapeutic/production/aurora-master-password \
  --secret-string '{"username":"admin","password":"<new-password>"}' \
  --kms-key-id <kms-key-arn> \
  --region us-east-1

# 2. Update Aurora master password to match
aws rds modify-db-cluster \
  --db-cluster-identifier omnirapeutic-production \
  --master-user-password <new-password> \
  --apply-immediately \
  --region us-east-1
```

## Testing & Validation

### Monthly DR Test

```bash
#!/bin/bash
# monthly-dr-test.sh

echo "=== DR Test Started: $(date) ==="

# 1. Create manual snapshot
echo "Creating snapshot..."
SNAPSHOT_ID="omnirapeutic-prod-dr-test-$(date +%Y%m%d-%H%M)"
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier $SNAPSHOT_ID \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1

aws rds wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier $SNAPSHOT_ID \
  --region us-east-1

echo "Snapshot created: $SNAPSHOT_ID"

# 2. Restore to test cluster
echo "Restoring to test cluster..."
TEST_CLUSTER="omnirapeutic-dr-test-$(date +%Y%m%d)"
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier $TEST_CLUSTER \
  --snapshot-identifier $SNAPSHOT_ID \
  --engine aurora-postgresql \
  --engine-version 15.10 \
  --vpc-security-group-ids $(terraform output -raw aurora_security_group_id) \
  --db-subnet-group-name omnirapeutic-production-aurora-subnet-group \
  --kms-key-id $(terraform output -json kms_keys | jq -r '.aurora') \
  --region us-east-1

# Create instance
aws rds create-db-instance \
  --db-instance-identifier $TEST_CLUSTER-instance-1 \
  --db-cluster-identifier $TEST_CLUSTER \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --region us-east-1

aws rds wait db-cluster-available \
  --db-cluster-identifier $TEST_CLUSTER \
  --region us-east-1

echo "Test cluster available"

# 3. Verify data integrity
TEST_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier $TEST_CLUSTER \
  --query 'DBClusters[0].Endpoint' \
  --output text \
  --region us-east-1)

echo "Testing connectivity..."
psql -h $TEST_ENDPOINT -U admin -d omnirapeutic -c "SELECT version();"
psql -h $TEST_ENDPOINT -U admin -d omnirapeutic -c "SELECT COUNT(*) FROM users;"

echo "Data integrity verified"

# 4. Cleanup test cluster
echo "Cleaning up test cluster..."
aws rds delete-db-cluster \
  --db-cluster-identifier $TEST_CLUSTER \
  --skip-final-snapshot \
  --region us-east-1

aws rds delete-db-cluster-snapshot \
  --db-cluster-snapshot-identifier $SNAPSHOT_ID \
  --region us-east-1

echo "=== DR Test Completed: $(date) ==="
echo "Result: SUCCESS"
```

Run test monthly and document results:
```bash
./monthly-dr-test.sh | tee dr-test-results-$(date +%Y%m).log
```

### RTO/RPO Validation

**Test Scenarios**:
1. Database restore from snapshot: Target 30 minutes, Measure actual
2. Point-in-time recovery: Target 45 minutes
3. Full infrastructure rebuild: Target 4 hours
4. Service restart: Target 10 minutes

**Validation Script**:
```bash
#!/bin/bash
echo "RTO Test: Database Restore from Snapshot"
START_TIME=$(date +%s)

# Restore cluster...
# (restoration commands here)

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo "Recovery completed in $((DURATION / 60)) minutes"

if [ $DURATION -lt 1800 ]; then
  echo "✓ RTO target met (< 30 minutes)"
else
  echo "✗ RTO target missed"
fi
```

## Incident Scenarios

### Scenario 1: Database Corruption

**Detection**: Application errors, data integrity issues

**Response**:
1. Stop all write operations (scale services to 0)
2. Create immediate snapshot of corrupted cluster
3. Identify last known good backup point
4. Restore from automated backup or manual snapshot
5. Verify data integrity in restored cluster
6. Promote restored cluster to production
7. Resume application services

**Expected Duration**: 1-2 hours

### Scenario 2: Complete Service Outage

**Detection**: All ECS tasks failing, health check alarms

**Response**:
1. Check ECS cluster status
2. Review task failure reasons
3. Check ALB health checks
4. Verify security groups and networking
5. Force new deployment or rollback task definitions
6. Scale up if needed

**Expected Duration**: 15-30 minutes

### Scenario 3: Regional AWS Outage

**Detection**: AWS service health dashboard, multiple alarms

**Response**:
1. Confirm AWS service status
2. If prolonged outage, initiate multi-region failover (future)
3. Restore from cross-region snapshot to new region
4. Rebuild infrastructure in new region using Terraform
5. Update DNS to point to new region

**Expected Duration**: 4-8 hours (without automated multi-region setup)

### Scenario 4: Accidental Terraform Destroy

**Detection**: Resources missing, service outage

**Response**:
1. Don't panic - data is safe in backups
2. Restore Terraform state from backup
3. Run terraform plan to see what needs to be recreated
4. Run terraform apply to recreate infrastructure
5. Restore Aurora from latest automated backup
6. Verify all services

**Expected Duration**: 2-4 hours

## DR Runbooks

### Runbook: Emergency Database Failover

```bash
#!/bin/bash
# emergency-db-failover.sh

set -e

echo "=== EMERGENCY DATABASE FAILOVER ==="
echo "This script will restore Aurora to the most recent backup"
read -p "Continue? (yes/no): " confirm
[[ "$confirm" != "yes" ]] && exit 1

# 1. Stop application
echo "Stopping application services..."
for service in api web worker; do
  aws ecs update-service \
    --cluster omnirapeutic-production \
    --service omnirapeutic-production-$service \
    --desired-count 0 \
    --region us-east-1
done

# 2. Snapshot current state
echo "Creating final snapshot of current cluster..."
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier omnirapeutic-emergency-failover-$(date +%Y%m%d-%H%M) \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1

# 3. Restore from backup
echo "Restoring from most recent backup..."
RESTORE_TIME=$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S)Z
aws rds restore-db-cluster-to-point-in-time \
  --source-db-cluster-identifier omnirapeutic-production \
  --db-cluster-identifier omnirapeutic-production-failover \
  --restore-to-time $RESTORE_TIME \
  --vpc-security-group-ids $(terraform output -raw aurora_security_group_id) \
  --db-subnet-group-name omnirapeutic-production-aurora-subnet-group \
  --kms-key-id $(terraform output -json kms_keys | jq -r '.aurora') \
  --region us-east-1

# Create instance
aws rds create-db-instance \
  --db-instance-identifier omnirapeutic-production-failover-instance-1 \
  --db-cluster-identifier omnirapeutic-production-failover \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --region us-east-1

# Configure scaling
aws rds modify-db-cluster \
  --db-cluster-identifier omnirapeutic-production-failover \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --apply-immediately \
  --region us-east-1

echo "Waiting for cluster to be available..."
aws rds wait db-cluster-available \
  --db-cluster-identifier omnirapeutic-production-failover \
  --region us-east-1

# 4. Update application config
FAILOVER_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production-failover \
  --query 'DBClusters[0].Endpoint' \
  --output text \
  --region us-east-1)

echo "New database endpoint: $FAILOVER_ENDPOINT"
echo "Update ECS task definitions with this endpoint"
read -p "Press enter after updating task definitions..."

# 5. Restart application
echo "Restarting application services..."
for service in api web worker; do
  aws ecs update-service \
    --cluster omnirapeutic-production \
    --service omnirapeutic-production-$service \
    --desired-count 2 \
    --force-new-deployment \
    --region us-east-1
done

echo "=== FAILOVER COMPLETE ==="
echo "Verify application functionality before proceeding"
```

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial disaster recovery documentation |
