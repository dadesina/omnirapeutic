# Security & Compliance - Omnirapeutic Production Infrastructure

## Table of Contents

1. [HIPAA Compliance Overview](#hipaa-compliance-overview)
2. [Security Controls](#security-controls)
3. [Encryption](#encryption)
4. [Access Control](#access-control)
5. [Audit Logging](#audit-logging)
6. [Compliance Monitoring](#compliance-monitoring)
7. [Security Incident Response](#security-incident-response)
8. [Compliance Checklist](#compliance-checklist)

## HIPAA Compliance Overview

The Omnirapeutic production infrastructure is designed to meet HIPAA (Health Insurance Portability and Accountability Act) requirements for handling Protected Health Information (PHI).

### AWS HIPAA Eligibility

All AWS services used in this infrastructure are HIPAA-eligible:
- Amazon VPC
- Amazon ECS (Fargate)
- Amazon Aurora PostgreSQL
- Amazon ECR
- Elastic Load Balancing (ALB)
- AWS WAF
- AWS KMS
- AWS Secrets Manager
- Amazon CloudWatch
- AWS CloudTrail
- AWS Config
- Amazon GuardDuty
- Amazon S3
- AWS Systems Manager

### Business Associate Agreement (BAA)

Ensure AWS BAA is in place:
```bash
# Verify BAA status in AWS Artifact
# Navigate to: AWS Console → Artifact → Agreements
# Download and review AWS Business Associate Addendum
```

## Security Controls

### Network Security

#### VPC Isolation
```bash
# Verify VPC isolation
VPC_ID=$(terraform output -raw vpc_id)
aws ec2 describe-vpcs \
  --vpc-ids $VPC_ID \
  --query 'Vpcs[0].[VpcId,CidrBlock,IsDefault]' \
  --region us-east-1
```

**Controls**:
- Dedicated VPC (10.0.0.0/16)
- Multi-AZ deployment (3 availability zones)
- Network segmentation:
  - Public subnets: ALB only
  - Private app subnets: ECS tasks
  - Private data subnets: Aurora cluster
- No direct internet access for application/database tiers

#### Security Groups

```bash
# Review security group rules
aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[].[GroupName,GroupId,IpPermissions[].{From:FromPort,To:ToPort,Proto:IpProtocol,Source:IpRanges[].CidrIp}]' \
  --region us-east-1
```

**Principle of Least Privilege**:
- ALB Security Group: HTTP/HTTPS from internet (0.0.0.0/0)
- ECS Security Group: Traffic only from ALB
- Aurora Security Group: PostgreSQL (5432) only from ECS and Bastion
- Bastion Security Group: No inbound except SSM (no SSH port)

#### WAF Protection

```bash
# Check WAF rules
aws wafv2 get-web-acl \
  --name omnirapeutic-production-waf \
  --scope REGIONAL \
  --id $(terraform output -raw waf_web_acl_id) \
  --region us-east-1
```

**WAF Rules**:
1. AWS Managed Rules - Common Rule Set (OWASP Top 10)
2. AWS Managed Rules - Known Bad Inputs
3. AWS Managed Rules - SQL Injection Protection
4. Rate Limiting: 2000 requests per 5 minutes per IP

#### Network Monitoring

```bash
# VPC Flow Logs capture all network traffic
aws ec2 describe-flow-logs \
  --filter "Name=resource-id,Values=$VPC_ID" \
  --region us-east-1

# Review flow logs
aws logs tail /aws/vpc/omnirapeutic-production-flow-logs \
  --since 1h \
  --region us-east-1
```

### Application Security

#### Container Security

```bash
# ECR Image Scanning
aws ecr describe-image-scan-findings \
  --repository-name omnirapeutic-production-api \
  --image-id imageTag=latest \
  --region us-east-1

# List vulnerabilities
aws ecr describe-image-scan-findings \
  --repository-name omnirapeutic-production-api \
  --image-id imageTag=latest \
  --query 'imageScanFindings.findings[?severity==`HIGH` || severity==`CRITICAL`]' \
  --region us-east-1
```

**Controls**:
- Automated vulnerability scanning on image push
- Use minimal base images (alpine, distroless)
- Regular image updates and patching
- No hardcoded secrets in images

#### IAM Least Privilege

```bash
# Review ECS task execution role
aws iam get-role \
  --role-name omnirapeutic-production-ecs-task-execution-role \
  --region us-east-1

# Review attached policies
aws iam list-attached-role-policies \
  --role-name omnirapeutic-production-ecs-task-execution-role \
  --region us-east-1

# Review task role (application permissions)
aws iam get-role \
  --role-name omnirapeutic-production-ecs-task-role \
  --region us-east-1
```

**IAM Best Practices**:
- Task execution role: ECR pull, CloudWatch Logs, Secrets Manager read-only
- Task role: Minimal permissions for application (S3, SQS, etc.)
- No long-term credentials (IAM roles only)
- Regular access review and permission audits

## Encryption

### Encryption at Rest

#### KMS Keys

```bash
# List KMS keys
aws kms list-aliases \
  --query 'Aliases[?starts_with(AliasName, `alias/omnirapeutic`)]' \
  --region us-east-1

# Check key policy
AURORA_KEY_ID=$(terraform output -json kms_keys | jq -r '.aurora')
aws kms get-key-policy \
  --key-id $AURORA_KEY_ID \
  --policy-name default \
  --region us-east-1
```

**KMS Encryption Applied To**:
- Aurora PostgreSQL cluster
- Aurora automated backups
- EBS volumes (bastion host)
- S3 buckets (CloudTrail, ALB logs)
- ECR repositories
- Secrets Manager secrets
- CloudWatch Logs (optional)
- SNS topics

#### Verify Aurora Encryption

```bash
# Check Aurora encryption status
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].[StorageEncrypted,KmsKeyId]' \
  --region us-east-1

# Verify encryption is enabled
# Should return: [true, "arn:aws:kms:..."]
```

#### Verify S3 Encryption

```bash
# Check CloudTrail bucket encryption
TRAIL_BUCKET=$(terraform output -raw cloudtrail_s3_bucket)
aws s3api get-bucket-encryption \
  --bucket $TRAIL_BUCKET \
  --region us-east-1
```

### Encryption in Transit

**TLS/SSL Requirements**:
- All data in transit must use TLS 1.2 or higher
- Aurora: Enforce SSL connections
- ALB: HTTPS listener with ACM certificate (when configured)
- Internal services: TLS for service-to-service communication

#### Enforce Aurora SSL

```sql
-- Connect to Aurora via bastion
psql -h <aurora-endpoint> -U admin -d omnirapeutic

-- Check SSL enforcement
SHOW ssl;

-- Verify current connections are using SSL
SELECT pid, usename, application_name, ssl, client_addr
FROM pg_stat_ssl
JOIN pg_stat_activity USING (pid);

-- Enforce SSL for all users (except local connections)
ALTER USER admin SET ssl = on;

-- Or use parameter group to enforce SSL cluster-wide
```

```bash
# Create custom parameter group with SSL enforcement
aws rds create-db-cluster-parameter-group \
  --db-cluster-parameter-group-name omnirapeutic-ssl-enforced \
  --db-parameter-group-family aurora-postgresql15 \
  --description "Aurora PostgreSQL 15 with SSL enforcement" \
  --region us-east-1

# Modify parameters
aws rds modify-db-cluster-parameter-group \
  --db-cluster-parameter-group-name omnirapeutic-ssl-enforced \
  --parameters "ParameterName=rds.force_ssl,ParameterValue=1,ApplyMethod=immediate" \
  --region us-east-1

# Apply to cluster
aws rds modify-db-cluster \
  --db-cluster-identifier omnirapeutic-production \
  --db-cluster-parameter-group-name omnirapeutic-ssl-enforced \
  --apply-immediately \
  --region us-east-1
```

## Access Control

### Bastion Host Access

```bash
# Connect via SSM Session Manager (no SSH keys)
BASTION_ID=$(terraform output -raw bastion_instance_id)
aws ssm start-session --target $BASTION_ID --region us-east-1
```

**Access Controls**:
- No SSH port open (port 22 blocked)
- SSM Session Manager only
- Session logging to CloudWatch Logs
- IAM-based authentication
- MFA required for production access (via IAM policy)

#### Require MFA for Bastion Access

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:us-east-1:*:instance/i-0f6b7bae60da49bb0",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    }
  ]
}
```

### Database Access Control

```bash
# Review database users
psql -h <aurora-endpoint> -U admin -d omnirapeutic -c "\du"

# Review user permissions
psql -h <aurora-endpoint> -U admin -d omnirapeutic -c "
SELECT grantee, privilege_type, table_schema, table_name
FROM information_schema.table_privileges
WHERE grantee != 'admin'
ORDER BY grantee, table_name;"
```

**Database Security Best Practices**:
- Rotate master password regularly (90 days)
- Use separate application users (not master user)
- Grant minimum required permissions
- Audit user access regularly
- Enable pgAudit for query logging

### Secrets Management

```bash
# List secrets
aws secretsmanager list-secrets \
  --filters Key=name,Values=omnirapeutic/production \
  --region us-east-1

# Check secret rotation
aws secretsmanager describe-secret \
  --secret-id omnirapeutic/production/aurora-master-password \
  --region us-east-1

# Rotate secret manually
aws secretsmanager rotate-secret \
  --secret-id omnirapeutic/production/aurora-master-password \
  --region us-east-1
```

**Secrets Best Practices**:
- Store all credentials in Secrets Manager
- Enable automatic rotation (30-90 days)
- Use IAM roles to access secrets (no hardcoded credentials)
- Encrypt secrets with KMS
- Audit secret access via CloudTrail

## Audit Logging

### CloudTrail

```bash
# Verify CloudTrail is logging
TRAIL_ARN=$(terraform output -raw cloudtrail_arn)
aws cloudtrail get-trail-status \
  --name $TRAIL_ARN \
  --region us-east-1

# Search CloudTrail events
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --max-results 10 \
  --region us-east-1

# Download logs from S3
TRAIL_BUCKET=$(terraform output -raw cloudtrail_s3_bucket)
aws s3 ls s3://$TRAIL_BUCKET/AWSLogs/ --recursive | tail -20
```

**CloudTrail Logging**:
- All AWS API calls logged
- 90-day retention in CloudWatch Logs
- Indefinite retention in S3
- Log file integrity validation enabled
- Encrypted with KMS

### Database Audit Logging (pgAudit)

```sql
-- Install pgAudit extension
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Configure audit logging
ALTER SYSTEM SET pgaudit.log = 'all';  -- Log all statements
ALTER SYSTEM SET pgaudit.log_catalog = 'off';  -- Don't log system catalog queries
ALTER SYSTEM SET pgaudit.log_parameter = 'on';  -- Log query parameters
ALTER SYSTEM SET pgaudit.log_relation = 'on';  -- Log table names

-- Reload configuration
SELECT pg_reload_conf();

-- Verify configuration
SHOW pgaudit.log;
```

```bash
# View pgAudit logs in CloudWatch
aws logs tail /aws/rds/cluster/omnirapeutic-production/postgresql \
  --follow \
  --filter-pattern "AUDIT" \
  --region us-east-1
```

**pgAudit Configuration**:
- Log all DDL (CREATE, ALTER, DROP)
- Log all DML on PHI tables (INSERT, UPDATE, DELETE, SELECT)
- Log user connections and disconnections
- Include query parameters for forensics
- 90-day retention in CloudWatch Logs

### Application Logging

```bash
# View application logs
aws logs tail /ecs/omnirapeutic-production/api \
  --follow \
  --region us-east-1

# Search for PHI access
aws logs filter-log-events \
  --log-group-name /ecs/omnirapeutic-production/api \
  --filter-pattern "PHI_ACCESS" \
  --start-time $(($(date +%s) - 86400))000 \
  --region us-east-1
```

**Application Logging Requirements**:
- Log all PHI access (user, timestamp, record ID)
- Log authentication attempts
- Log authorization failures
- Do NOT log PHI data itself
- 30-day retention minimum

### SSM Session Logging

```bash
# View bastion session logs
aws logs tail /aws/ssm/omnirapeutic-production-bastion-sessions \
  --follow \
  --region us-east-1
```

## Compliance Monitoring

### AWS Config

```bash
# Check Config recorder status
CONFIG_RECORDER=$(terraform output -raw config_recorder_id)
aws configservice describe-configuration-recorder-status \
  --configuration-recorder-names $CONFIG_RECORDER \
  --region us-east-1

# Check HIPAA conformance pack
CONFORMANCE_PACK=$(terraform output -raw config_conformance_pack_arn)
aws configservice describe-conformance-pack-compliance \
  --conformance-pack-name $(echo $CONFORMANCE_PACK | cut -d'/' -f2) \
  --region us-east-1

# List non-compliant resources
aws configservice describe-compliance-by-config-rule \
  --compliance-types NON_COMPLIANT \
  --region us-east-1
```

**AWS Config Rules (HIPAA Pack)**:
- cloudtrail-enabled
- encrypted-volumes
- rds-storage-encrypted
- s3-bucket-server-side-encryption-enabled
- vpc-flow-logs-enabled
- cloudwatch-alarm-action-check
- iam-password-policy
- mfa-enabled-for-iam-console-access

### GuardDuty

```bash
# Check GuardDuty findings
DETECTOR_ID=$(terraform output -raw guardduty_detector_id)
aws guardduty list-findings \
  --detector-id $DETECTOR_ID \
  --finding-criteria '{"Criterion":{"severity":{"Gte":4}}}' \
  --region us-east-1

# Get finding details
FINDING_IDS=$(aws guardduty list-findings \
  --detector-id $DETECTOR_ID \
  --finding-criteria '{"Criterion":{"severity":{"Gte":4}}}' \
  --query 'FindingIds[0:5]' \
  --output text \
  --region us-east-1)

aws guardduty get-findings \
  --detector-id $DETECTOR_ID \
  --finding-ids $FINDING_IDS \
  --region us-east-1
```

**GuardDuty Threat Detection**:
- Unusual API calls
- Compromised credentials
- Cryptocurrency mining
- Malware detection (EBS, ECS)
- Unauthorized access attempts

### Regular Compliance Audits

**Monthly Checklist**:
```bash
#!/bin/bash
# monthly-compliance-audit.sh

echo "=== CloudTrail Status ==="
aws cloudtrail get-trail-status --name $(terraform output -raw cloudtrail_arn) --region us-east-1

echo "=== Config Compliance ==="
aws configservice describe-compliance-by-config-rule --compliance-types NON_COMPLIANT --region us-east-1

echo "=== GuardDuty High Severity Findings ==="
aws guardduty list-findings --detector-id $(terraform output -raw guardduty_detector_id) \
  --finding-criteria '{"Criterion":{"severity":{"Gte":7}}}' --region us-east-1

echo "=== Aurora Encryption Status ==="
aws rds describe-db-clusters --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].StorageEncrypted' --region us-east-1

echo "=== ECR Image Scan Results ==="
aws ecr describe-image-scan-findings --repository-name omnirapeutic-production-api \
  --image-id imageTag=latest --region us-east-1

echo "=== Unused Access Keys (>90 days) ==="
aws iam list-users --query 'Users[].UserName' --output text | while read user; do
  aws iam list-access-keys --user-name $user --region us-east-1
done

echo "=== MFA Status for IAM Users ==="
aws iam get-credential-report --region us-east-1
```

## Security Incident Response

### Incident Response Plan

**Phase 1: Detection**
- CloudWatch Alarms
- GuardDuty findings
- AWS Config non-compliance
- User reports

**Phase 2: Analysis**
```bash
# Review CloudTrail for suspicious activity
aws cloudtrail lookup-events \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --query 'Events[?ErrorCode!=`null`]' \
  --region us-east-1

# Check for unauthorized API calls
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRole \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1

# Review security group changes
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AuthorizeSecurityGroupIngress \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1
```

**Phase 3: Containment**
```bash
# Isolate compromised instance
INSTANCE_ID=<compromised-instance-id>
aws ec2 modify-instance-attribute \
  --instance-id $INSTANCE_ID \
  --groups sg-isolated \
  --region us-east-1

# Revoke compromised credentials
aws iam delete-access-key \
  --user-name <compromised-user> \
  --access-key-id <compromised-key> \
  --region us-east-1

# Rotate all secrets
aws secretsmanager rotate-secret \
  --secret-id omnirapeutic/production/aurora-master-password \
  --region us-east-1
```

**Phase 4: Eradication**
- Remove malware/backdoors
- Patch vulnerabilities
- Update security groups

**Phase 5: Recovery**
- Restore from clean backups
- Redeploy services
- Verify integrity

**Phase 6: Lessons Learned**
- Document incident
- Update security controls
- Review and update response plan

### Breach Notification

If PHI is compromised, follow HIPAA Breach Notification Rule:
1. Notify affected individuals within 60 days
2. Notify HHS if >500 individuals affected
3. Notify media if >500 individuals in same jurisdiction
4. Document breach details and response

## Compliance Checklist

### HIPAA Technical Safeguards

- [ ] **Access Control**: Unique user IDs, emergency access, automatic logoff, encryption
- [ ] **Audit Controls**: Record and examine activity
- [ ] **Integrity**: Ensure data not improperly altered or destroyed
- [ ] **Transmission Security**: Encrypt PHI in transit

### HIPAA Physical Safeguards

- [ ] **Facility Access**: AWS data center compliance (BAA)
- [ ] **Workstation Security**: Secure access to PHI
- [ ] **Device and Media Controls**: Secure disposal of storage media

### HIPAA Administrative Safeguards

- [ ] **Security Management**: Risk analysis, risk management, sanctions, information system activity review
- [ ] **Workforce Security**: Authorization, supervision, training
- [ ] **Information Access**: Isolate PHI, access controls
- [ ] **Security Awareness**: Training, malware protection, monitoring
- [ ] **Contingency Plan**: Data backup, disaster recovery, testing

### Monthly Review Checklist

```bash
# Run automated compliance check
./monthly-compliance-audit.sh > compliance-report-$(date +%Y-%m).txt

# Review report for:
# - Non-compliant AWS Config rules
# - High severity GuardDuty findings
# - CloudTrail logging status
# - Encryption status for all resources
# - IAM user access and MFA status
# - Secrets rotation status
# - ECR vulnerability scans
```

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial security and compliance documentation |
