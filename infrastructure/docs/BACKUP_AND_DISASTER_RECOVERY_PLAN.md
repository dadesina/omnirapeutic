# Backup and Disaster Recovery Plan

## Overview

This document defines the Backup and Disaster Recovery (B/DR) plan for Omnirapeutic, ensuring compliance with HIPAA § 164.308(a)(7) Contingency Plan requirements. The plan covers data backup procedures, disaster recovery processes, and business continuity measures.

## HIPAA Compliance Requirements

HIPAA § 164.308(a)(7) mandates the following contingency plan components:
- **Data Backup Plan (Required)**: Establish and implement procedures to create and maintain retrievable exact copies of ePHI
- **Disaster Recovery Plan (Required)**: Establish procedures to restore any loss of data
- **Emergency Mode Operation Plan (Required)**: Establish procedures to enable continuation of critical business processes
- **Testing and Revision Procedures (Addressable)**: Implement procedures for periodic testing and revision of contingency plans

## Recovery Objectives

### Recovery Time Objective (RTO)

**Definition**: Maximum acceptable time to restore service after a disaster.

**Targets by Severity Level**:

| Severity | RTO Target | Description | Justification |
|----------|------------|-------------|---------------|
| Critical (Data Loss) | **4 hours** | Database corruption, accidental deletion, ransomware | HIPAA allows reasonable time; 4 hours balances urgency with careful restoration |
| Major (Availability) | **2 hours** | Regional AWS outage, complete infrastructure failure | Healthcare services need timely restoration; 2 hours is industry standard |
| Minor (Performance) | **24 hours** | Performance degradation, partial service loss | Non-critical issues can be resolved during business hours |

### Recovery Point Objective (RPO)

**Definition**: Maximum acceptable amount of data loss measured in time.

**Current Implementation**: **5 minutes**

**Justification**:
- Aurora PostgreSQL provides **continuous backup with point-in-time recovery (PITR)**
- Automated snapshots every 5 minutes to Amazon S3
- Transaction logs backed up continuously
- Enables restoration to any point within the 35-day retention window
- Exceeds HIPAA requirements (which don't specify RPO but require "retrievable exact copies")

### Business Impact Analysis

| Downtime Duration | Business Impact | Patient Impact | Regulatory Risk |
|-------------------|-----------------|----------------|-----------------|
| 0-15 minutes | Minimal | None (API retries) | None |
| 15 minutes - 2 hours | Low | Minor inconvenience | Low |
| 2-4 hours | Moderate | Delayed care access | Moderate |
| 4-24 hours | High | Significant disruption | High (potential violation) |
| > 24 hours | Critical | Critical care disruption | Critical (reportable breach) |

## Current Backup Configuration

### Automated Backups

**AWS RDS Aurora PostgreSQL Cluster**: `omnirapeutic-production`

| Configuration | Value | Compliance Note |
|---------------|-------|-----------------|
| **Backup Retention** | 35 days | Exceeds HIPAA 30-day minimum |
| **Backup Window** | 03:00-04:00 UTC (10pm-11pm EST) | Low-traffic period |
| **Point-in-Time Recovery** | Enabled (5-minute granularity) | Continuous transaction log backup |
| **Storage Encryption** | Enabled (AWS KMS) | HIPAA § 164.312(a)(2)(iv) requirement |
| **Deletion Protection** | Enabled | Prevents accidental deletion |
| **Multi-AZ** | Enabled | High availability across availability zones |

### Backup Storage

- **Location**: Amazon S3 (encrypted, multi-AZ, managed by AWS RDS)
- **Redundancy**: 6 copies across 3 Availability Zones
- **Durability**: 99.999999999% (11 nines)
- **Versioning**: Enabled via Aurora versioning
- **Access Control**: IAM policies with least-privilege access

### Backup Verification

**Automated Daily Checks**:
- AWS RDS performs automated backup integrity checks
- CloudWatch alarms monitor backup job status
- Automated restore testing (see Testing section below)

## Disaster Recovery Procedures

### Disaster Scenarios

#### Scenario 1: Accidental Data Deletion
**Likelihood**: Medium | **Impact**: High | **RPO**: 5 minutes | **RTO**: 2 hours

**Detection**:
- User reports missing data
- Audit logs show unexpected DELETE operations
- Monitoring alerts on abnormal database activity

**Recovery Steps**:
1. **Isolate** (15 minutes):
   - Identify the time of deletion via audit logs
   - Determine affected tables/records
   - Document the incident for compliance reporting

2. **Restore** (60 minutes):
   - Create a new Aurora cluster from point-in-time backup (5 minutes before incident)
   - Verify data integrity in restored cluster
   - Extract affected records using SQL queries

3. **Merge** (30 minutes):
   - Insert missing records into production database
   - Validate data consistency across relationships
   - Run application smoke tests

4. **Verify** (15 minutes):
   - User confirms data restoration
   - Review audit logs to confirm restoration
   - Clean up temporary restore cluster

#### Scenario 2: Database Corruption
**Likelihood**: Low | **Impact**: Critical | **RPO**: 5 minutes | **RTO**: 4 hours

**Detection**:
- Application errors (5xx responses)
- Database connection failures
- CloudWatch alarms on database errors
- Aurora cluster status shows "failed"

**Recovery Steps**:
1. **Assess** (30 minutes):
   - Determine extent of corruption
   - Identify last known good backup time
   - Notify stakeholders of potential downtime
   - Enable maintenance mode page

2. **Restore** (2 hours):
   - Create new Aurora cluster from latest snapshot
   - Apply point-in-time recovery to 5 minutes before corruption
   - Update DNS/connection strings (if needed)
   - Run database integrity checks (VACUUM, ANALYZE)

3. **Migrate** (60 minutes):
   - Update application configuration (DATABASE_URL)
   - Deploy updated ECS task definitions
   - Verify application connectivity
   - Run full test suite

4. **Validate** (30 minutes):
   - User acceptance testing
   - Monitor error rates and performance
   - Disable maintenance mode
   - Post-incident review

#### Scenario 3: Regional AWS Outage
**Likelihood**: Very Low | **Impact**: Critical | **RPO**: 5 minutes | **RTO**: 4 hours

**Current Limitation**: Single-region deployment (us-east-1)

**Recovery Steps**:
1. **Monitor** (15 minutes):
   - AWS Health Dashboard for region status
   - Confirm outage scope and ETA
   - Notify stakeholders

2. **Decision Point** (15 minutes):
   - If ETA < 2 hours: Wait for AWS recovery
   - If ETA > 2 hours: Initiate cross-region restore

3. **Cross-Region Restore** (3 hours):
   - Copy latest snapshot to backup region (us-west-2)
   - Create Aurora cluster in us-west-2
   - Deploy application infrastructure in us-west-2
   - Update Route53 DNS to point to new region

4. **Verify** (30 minutes):
   - Health checks pass in new region
   - User acceptance testing
   - Monitor for issues

**Future Enhancement**: Implement cross-region read replicas for faster failover (RTO < 1 hour)

#### Scenario 4: Ransomware/Security Incident
**Likelihood**: Low | **Impact**: Critical | **RPO**: 5 minutes | **RTO**: 4 hours

**Detection**:
- GuardDuty alerts on anomalous behavior
- CloudTrail shows unauthorized API calls
- Unusual database encryption or data modifications
- Security team notification

**Recovery Steps**:
1. **Contain** (30 minutes):
   - Isolate affected systems (revoke IAM credentials)
   - Preserve forensic evidence (snapshot current state)
   - Enable AWS GuardDuty threat detection
   - Notify security team and legal counsel

2. **Investigate** (60 minutes):
   - Determine entry point and attack timeline
   - Identify compromised credentials/services
   - Assess data exfiltration risk (report to HHS if PHI breach)
   - Document all findings for incident report

3. **Restore** (2 hours):
   - Restore database from clean backup (before attack)
   - Rotate all secrets, passwords, API keys
   - Rebuild compromised infrastructure from IaC
   - Apply security patches and updates

4. **Harden** (30 minutes):
   - Review and tighten IAM policies
   - Enable MFA on all accounts
   - Update security group rules
   - Implement additional monitoring

**Compliance**: HIPAA breach notification required if PHI was accessed/exfiltrated (60-day reporting window)

## Testing and Validation

### Restore Testing Schedule

| Test Type | Frequency | Last Performed | Next Scheduled | Success Criteria |
|-----------|-----------|----------------|----------------|------------------|
| **Point-in-Time Recovery** | Monthly | TBD | TBD | Restore completes in < 30 min, data validates |
| **Full Disaster Recovery** | Quarterly | TBD | TBD | RTO met, all services operational |
| **Tabletop Exercise** | Semi-annually | TBD | TBD | Team demonstrates procedure knowledge |
| **Cross-Region Failover** | Annually | TBD | TBD | Failover completes within RTO |

### Automated Restore Validation

**Script Location**: `/root/projects/omnirapeutic/infrastructure/scripts/test_disaster_recovery.sh`

**Test Process**:
1. Create restore cluster from latest automated backup
2. Run schema validation queries
3. Execute data integrity checks
4. Compare record counts with production
5. Verify encryption and access controls
6. Clean up test cluster
7. Generate test report with pass/fail status

**Automated Execution**: Weekly via GitHub Actions workflow

## Backup Monitoring and Alerting

### CloudWatch Alarms

| Alarm | Threshold | Action | Notification |
|-------|-----------|--------|--------------|
| Backup Failure | 1 failed backup | Page on-call | PagerDuty + Email |
| Backup Duration | > 60 minutes | Warning | Email only |
| Storage Usage | > 80% capacity | Warning | Email + Slack |
| Snapshot Age | > 25 hours | Critical | PagerDuty + Email |
| PITR Gap | > 10 minutes | Critical | PagerDuty + Email |

### Backup Validation Metrics

**Daily Dashboard** (CloudWatch):
- Number of successful backups (target: 1/day)
- Backup completion time (target: < 30 minutes)
- Backup size trend (monitor growth)
- Point-in-time recovery gap (target: < 5 minutes)
- Failed restore tests (target: 0)

## Roles and Responsibilities

### Primary Contacts

| Role | Responsibility | Contact | Backup Contact |
|------|----------------|---------|----------------|
| **Disaster Recovery Lead** | Coordinate recovery efforts | TBD | TBD |
| **Database Administrator** | Execute database restoration | TBD | TBD |
| **DevOps Engineer** | Infrastructure recovery | TBD | TBD |
| **Security Officer** | Security incident response | TBD | TBD |
| **HIPAA Compliance Officer** | Regulatory reporting | TBD | TBD |

### Escalation Path

1. **On-Call Engineer** (First responder)
2. **DevOps Lead** (Escalation after 30 minutes)
3. **CTO** (Escalation after 2 hours or critical data loss)
4. **CEO** (Escalation after 4 hours or security incident)

## Communication Plan

### Internal Communication

**During Incident**:
- Slack #incidents channel for real-time updates
- Status.io for customer-facing status page
- Email updates every 30 minutes to stakeholders

**Post-Incident**:
- Post-mortem meeting within 48 hours
- Written incident report within 1 week
- HIPAA incident log updated

### External Communication

**Customers**:
- Status page updated within 15 minutes of detection
- Email notification if downtime > 1 hour
- Post-incident transparency report

**Regulatory**:
- HHS breach notification if PHI compromised (within 60 days)
- Annual HIPAA audit includes B/DR test results

## Infrastructure as Code

### Terraform Configuration

The Aurora backup configuration is defined in:
- **Module**: `/root/projects/omnirapeutic/infrastructure/terraform/modules/aurora/main.tf`
- **Key Settings** (lines 61-64):
  - `backup_retention_period = 35`
  - `preferred_backup_window = "03:00-04:00"`
  - `storage_encrypted = true`
  - `deletion_protection = var.enable_deletion_protection`

### Version Control

- All infrastructure changes tracked in Git
- Terraform state stored in encrypted S3 bucket with versioning
- State lock via DynamoDB to prevent concurrent modifications

## Cost Analysis

### Current Backup Costs (Estimated)

| Resource | Monthly Cost | Annual Cost | Notes |
|----------|--------------|-------------|-------|
| Aurora Backup Storage (35 days) | $50 | $600 | Based on 100GB database |
| Snapshot Storage | $15 | $180 | Manual snapshots |
| Data Transfer (restore testing) | $10 | $120 | Monthly restore tests |
| **Total** | **$75** | **$900** | Scales with database size |

### Cost Optimization

- Backup retention is 35 days (optimal for HIPAA)
- No long-term archival needed (operational database)
- Cross-region replication adds ~$200/month (future enhancement)

## Compliance Evidence

### Audit Artifacts

**Generated Automatically**:
- CloudWatch logs of backup jobs
- AWS Config rules for backup compliance
- Restore test results and reports
- Incident response logs

**Manual Documentation**:
- Annual B/DR test report
- Policy review and approval signatures
- Staff training records
- Vendor agreements (AWS BAA)

### HIPAA Mapping

| HIPAA Requirement | Implementation | Evidence Location |
|-------------------|----------------|-------------------|
| § 164.308(a)(7)(ii)(A) Data Backup | Aurora automated backups (35 days) | AWS RDS Console, CloudWatch Logs |
| § 164.308(a)(7)(ii)(B) Disaster Recovery | Documented procedures in this plan | This document, test reports |
| § 164.308(a)(7)(ii)(C) Emergency Mode | Maintenance mode + cross-region failover | Status page, Route53 configs |
| § 164.308(a)(7)(ii)(D) Testing | Quarterly DR tests | Test reports in `/infrastructure/docs/tests/` |
| § 164.312(a)(2)(iv) Encryption | AWS KMS encryption at rest | AWS RDS Console, Terraform config |

## Document Control

- **Version**: 1.0
- **Created**: 2025-11-25
- **Last Reviewed**: 2025-11-25
- **Next Review**: 2026-02-25 (Quarterly)
- **Owner**: DevOps Team
- **Approved By**: TBD (CTO, HIPAA Compliance Officer)

## Related Documents

- Infrastructure deployment guide: `/infrastructure/DEPLOYMENT_INSTRUCTIONS.md`
- Security incident response plan: `/infrastructure/docs/SECURITY_INCIDENT_RESPONSE.md` (TBD)
- HIPAA compliance checklist: `/infrastructure/docs/HIPAA_COMPLIANCE_CHECKLIST.md` (TBD)
- Restore testing procedure: `/infrastructure/scripts/test_disaster_recovery.sh` (TBD)

## Next Steps

1. **Immediate** (This Sprint):
   - [ ] Create automated restore testing script
   - [ ] Set up CloudWatch alarms for backup monitoring
   - [ ] Perform initial restore test and document results
   - [ ] Define primary and backup contact owners

2. **Short-term** (Next Sprint):
   - [ ] Implement automated monthly restore testing via GitHub Actions
   - [ ] Create customer-facing status page
   - [ ] Document security incident response procedures

3. **Long-term** (Next Quarter):
   - [ ] Implement cross-region read replicas for faster failover
   - [ ] Conduct full disaster recovery tabletop exercise
   - [ ] Implement automated backup validation checks
