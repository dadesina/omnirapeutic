# Omnirapeutic Production Infrastructure

## Overview

This document provides comprehensive information about the Omnirapeutic production infrastructure deployed on AWS. The infrastructure is designed to be HIPAA-compliant, highly available, and secure.

## Infrastructure Summary

**Environment**: Production
**Region**: us-east-1
**Terraform Version**: >= 1.5.0
**Last Updated**: 2025-11-24

## Quick Links

- [Deployment Guide](./deployment-guide.md) - Step-by-step deployment instructions
- [Operations Runbook](./operations-runbook.md) - Day-to-day operational procedures
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
- [Security & Compliance](./security-compliance.md) - HIPAA compliance documentation
- [Disaster Recovery](./disaster-recovery.md) - Backup and recovery procedures
- [Monitoring Guide](./monitoring-guide.md) - CloudWatch alarms and metrics
- [Architecture Diagram](./architecture-diagram.md) - Visual infrastructure overview

## Deployed Resources

### Networking
- **VPC**: 10.0.0.0/16
- **Availability Zones**: us-east-1a, us-east-1b, us-east-1c
- **Public Subnets**: 3 (10.0.1.0/24, 10.0.2.0/24, 10.0.3.0/24)
- **Private App Subnets**: 3 (10.0.11.0/24, 10.0.12.0/24, 10.0.13.0/24)
- **Private Data Subnets**: 3 (10.0.21.0/24, 10.0.22.0/24, 10.0.23.0/24)
- **NAT Gateways**: 3 (one per AZ for high availability)

### Load Balancing
- **ALB DNS**: omnirapeutic-production-alb-941266984.us-east-1.elb.amazonaws.com
- **ALB Scheme**: Internet-facing
- **Listener**: HTTP (port 80) - HTTPS to be configured with certificate
- **Target Group**: Health checks on `/` with 200 OK matcher

### Web Application Firewall
- **WAF WebACL ID**: 7d38d0f3-dd60-459c-ba56-01f4eaeac37b
- **Protection Type**: REGIONAL (ALB)
- **Managed Rules**:
  - AWS Managed Rules - Common Rule Set (OWASP Top 10)
  - AWS Managed Rules - Known Bad Inputs
  - AWS Managed Rules - SQL Injection Protection
- **Rate Limiting**: 2000 requests per 5 minutes per IP
- **Logging**: Disabled (CloudWatch metrics enabled)

### Container Services
- **ECS Cluster**: omnirapeutic-production
- **Launch Type**: Fargate
- **Services**:
  - nginx (test service): 2 tasks, 256 CPU, 512 MB memory
  - Future services: api, web, worker

### Database
- **Engine**: Aurora PostgreSQL Serverless v2
- **Version**: 15.10 (LTS)
- **Capacity**: Min 0.5 ACU, Max 1.0 ACU
- **Instances**: 1 writer
- **Encryption**: KMS (at-rest and in-transit)
- **Backups**: Automated daily snapshots, 7-day retention
- **Deletion Protection**: Enabled

### Container Registry
- **ECR Repositories**:
  - omnirapeutic-production-api
  - omnirapeutic-production-web
  - omnirapeutic-production-worker
- **Encryption**: KMS
- **Scanning**: Enabled on push

### Security & Access
- **Bastion Host**: i-0f6b7bae60da49bb0
- **Bastion Access**: SSM Session Manager (no SSH keys required)
- **KMS Keys**:
  - Aurora encryption key
  - S3 encryption key
  - Secrets Manager encryption key
- **Secrets Manager**: Aurora master password stored securely

### Monitoring & Compliance
- **CloudWatch Alarms**: 21 active alarms
  - Aurora: CPU, connections, memory, storage, replication lag
  - VPC: NAT Gateway metrics, VPC Flow Logs
  - Cost: Monthly budget threshold ($1500)
  - ALB: Response time, 5xx errors, unhealthy hosts
  - ECS: CPU/memory utilization, task count
  - WAF: Blocked requests
- **CloudTrail**: All API calls logged to S3
- **AWS Config**: HIPAA conformance pack enabled
- **GuardDuty**: Threat detection with malware protection
- **SNS Topic**: Alarm notifications (email subscription required)

## Prerequisites

### Required Tools
- AWS CLI (>= 2.0)
- Terraform (>= 1.5.0)
- Session Manager Plugin (for bastion access)

### Required Permissions
- Admin access to AWS account or equivalent permissions for:
  - VPC, EC2, ECS, ECR, RDS, ALB, WAF
  - IAM roles and policies
  - KMS key management
  - CloudWatch, CloudTrail, Config, GuardDuty
  - S3, Secrets Manager, SSM

### AWS Profile Configuration
```bash
# Configure AWS credentials
aws configure --profile omnirapeutic-production

# Test access
aws sts get-caller-identity --profile omnirapeutic-production
```

## Quick Start

### 1. Access Bastion Host
```bash
# Connect via SSM Session Manager
aws ssm start-session --target i-0f6b7bae60da49bb0 --region us-east-1
```

### 2. Test ALB Connectivity
```bash
# HTTP request to ALB
curl http://omnirapeutic-production-alb-941266984.us-east-1.elb.amazonaws.com

# Should return nginx default page (200 OK)
```

### 3. View CloudWatch Alarms
```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --region us-east-1
```

### 4. Deploy Application
See [Deployment Guide](./deployment-guide.md) for detailed instructions on:
- Building and pushing Docker images to ECR
- Creating ECS task definitions
- Deploying services to ECS cluster
- Configuring ALB target groups

## Architecture Highlights

### High Availability
- Multi-AZ deployment across 3 availability zones
- Aurora cluster with automatic failover
- ECS services with minimum 2 tasks
- NAT Gateways in each AZ
- ALB distributes traffic across all zones

### Security
- All data encrypted at rest (KMS)
- All data encrypted in transit (TLS)
- Network isolation with private subnets
- WAF protection against common attacks
- No direct internet access to application or database tiers
- Secrets managed in AWS Secrets Manager

### HIPAA Compliance
- Encryption: KMS encryption for all data at rest
- Access Control: IAM roles with least privilege
- Audit Logging: CloudTrail logs all API calls
- Monitoring: CloudWatch alarms for anomalies
- Configuration Management: AWS Config tracks compliance
- Threat Detection: GuardDuty monitors for threats
- Database Auditing: pgAudit extension (to be configured)

### Cost Optimization
- Aurora Serverless v2: Auto-scaling database capacity
- Fargate: Pay only for running containers
- NAT Gateways: Consolidated in fewer instances possible
- CloudWatch Logs: Retention policies to manage storage
- Budget Alarm: Alerts at $1500 monthly threshold

## Current Status

### Completed Sprints

**Sprint 1: Foundation** ✓
- VPC with multi-AZ networking
- Aurora PostgreSQL Serverless v2
- Bastion host with SSM access
- ECR repositories
- ECS cluster
- Application Load Balancer
- Security (KMS, Secrets Manager)
- Compliance (CloudTrail, Config, GuardDuty)
- Basic CloudWatch alarms

**Sprint 2: Protection & Validation** ✓
- WAF with managed rules
- Rate limiting protection
- Nginx test service deployment
- Enhanced CloudWatch alarms (ALB, ECS, WAF)
- Infrastructure validation complete

**Sprint 3: Documentation & Readiness** (In Progress)
- Documentation suite ← Current
- pgAudit installation (Pending)
- Production readiness validation (Pending)

## Support and Escalation

### Alarm Notification
Configure SNS topic subscription to receive alarm notifications:
```bash
aws sns subscribe \
  --topic-arn $(terraform output -raw alarms_sns_topic_arn) \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region us-east-1
```

### Incident Response
1. Check CloudWatch alarms for active alerts
2. Review application logs in CloudWatch Logs
3. Check WAF metrics for blocked requests
4. Access bastion host to investigate database
5. See [Troubleshooting Guide](./troubleshooting.md) for common issues

### Terraform State
- **Backend**: Local (to be migrated to S3 + DynamoDB)
- **State File Location**: `terraform.tfstate`
- **Workspace**: default

## Next Steps

1. **Configure HTTPS**: Obtain ACM certificate and update ALB listener
2. **Deploy Real Applications**: Replace nginx with actual api/web/worker services
3. **Enable pgAudit**: Install and configure database auditing
4. **Configure Monitoring**: Set up SNS email subscriptions for alarms
5. **Backup Strategy**: Test Aurora snapshot restore procedures
6. **DR Testing**: Validate disaster recovery procedures
7. **Load Testing**: Validate ALB, ECS, and Aurora under load
8. **Security Review**: Complete penetration testing

## Additional Resources

- AWS Well-Architected Framework: https://aws.amazon.com/architecture/well-architected/
- HIPAA on AWS: https://aws.amazon.com/compliance/hipaa-compliance/
- ECS Best Practices: https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/
- Aurora PostgreSQL Documentation: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial documentation after Sprint 2 completion |
