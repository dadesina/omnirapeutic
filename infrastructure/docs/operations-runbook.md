# Operations Runbook - Omnirapeutic Production Infrastructure

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Service Management](#service-management)
3. [Database Operations](#database-operations)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Incident Response](#incident-response)
6. [Maintenance Windows](#maintenance-windows)
7. [Emergency Procedures](#emergency-procedures)

## Daily Operations

### Morning Health Check

Perform these checks at the start of each business day:

```bash
# 1. Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --state-value ALARM \
  --region us-east-1

# 2. Check ECS service health
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api omnirapeutic-production-web omnirapeutic-production-worker \
  --query 'services[].[serviceName,runningCount,desiredCount,deployments[0].status]' \
  --output table \
  --region us-east-1

# 3. Check ALB target health
ALB_ARN=$(terraform output -raw alb_arn)
aws elbv2 describe-target-groups \
  --load-balancer-arn $ALB_ARN \
  --query 'TargetGroups[].[TargetGroupName,HealthCheckPath]' \
  --output table \
  --region us-east-1

# 4. Check Aurora cluster status
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].[Status,MultiAZ,ServerlessV2ScalingConfiguration]' \
  --output table \
  --region us-east-1

# 5. Review application logs for errors
aws logs tail /ecs/omnirapeutic-production/api \
  --since 1h \
  --filter-pattern "ERROR" \
  --region us-east-1
```

### Cost Monitoring

```bash
# Check current month spend
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE \
  --region us-east-1

# Check cost alarm status
aws cloudwatch describe-alarms \
  --alarm-names "omnirapeutic-production-cost-threshold" \
  --region us-east-1
```

### Security Review

```bash
# 1. Check GuardDuty findings
aws guardduty list-findings \
  --detector-id $(terraform output -raw guardduty_detector_id) \
  --finding-criteria '{"Criterion":{"severity":{"Gte":4}}}' \
  --region us-east-1

# 2. Check WAF blocked requests (last 24 hours)
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=omnirapeutic-production-waf Name=Region,Value=us-east-1 Name=Rule,Value=ALL \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --region us-east-1

# 3. Review AWS Config compliance
aws configservice describe-compliance-by-config-rule \
  --compliance-types NON_COMPLIANT \
  --region us-east-1
```

## Service Management

### Scaling ECS Services

```bash
# Scale API service
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --desired-count 4 \
  --region us-east-1

# Monitor scaling
aws ecs wait services-stable \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --region us-east-1

# View current service status
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].[serviceName,runningCount,desiredCount,deployments]' \
  --region us-east-1
```

### Deploying New Application Version

```bash
# 1. Build and push new image
docker build -t omnirapeutic-api:v1.2.3 .
docker tag omnirapeutic-api:v1.2.3 \
  $(terraform output -raw ecr_repository_urls | jq -r '.api'):v1.2.3
docker push $(terraform output -raw ecr_repository_urls | jq -r '.api'):v1.2.3

# 2. Update task definition with new image
aws ecs register-task-definition \
  --cli-input-json file://api-task-definition-v1.2.3.json \
  --region us-east-1

# 3. Update service
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --task-definition omnirapeutic-production-api:N \
  --force-new-deployment \
  --region us-east-1

# 4. Monitor deployment
watch -n 5 'aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query "services[0].deployments" \
  --region us-east-1'
```

### Restarting Services

```bash
# Force new deployment (rolling restart)
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --force-new-deployment \
  --region us-east-1

# Stop specific task (will be replaced automatically)
TASK_ARN=$(aws ecs list-tasks \
  --cluster omnirapeutic-production \
  --service-name omnirapeutic-production-api \
  --query 'taskArns[0]' \
  --output text \
  --region us-east-1)

aws ecs stop-task \
  --cluster omnirapeutic-production \
  --task $TASK_ARN \
  --reason "Manual restart for troubleshooting" \
  --region us-east-1
```

### Viewing Application Logs

```bash
# Tail logs in real-time
aws logs tail /ecs/omnirapeutic-production/api \
  --follow \
  --region us-east-1

# Search for errors in last hour
aws logs filter-log-events \
  --log-group-name /ecs/omnirapeutic-production/api \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "ERROR" \
  --region us-east-1

# Export logs to file
aws logs filter-log-events \
  --log-group-name /ecs/omnirapeutic-production/api \
  --start-time $(($(date +%s) - 86400))000 \
  --query 'events[*].[timestamp,message]' \
  --output text > api-logs-$(date +%Y%m%d).txt
```

## Database Operations

### Connecting to Aurora

```bash
# 1. Connect to bastion
BASTION_ID=$(terraform output -raw bastion_instance_id)
aws ssm start-session --target $BASTION_ID --region us-east-1

# 2. Inside bastion session, get credentials
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id omnirapeutic/production/aurora-master-password \
  --region us-east-1 \
  --query SecretString --output text | jq -r '.password')

# 3. Connect to Aurora
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Endpoint' \
  --output text \
  --region us-east-1)

psql -h $AURORA_ENDPOINT -U admin -d omnirapeutic
```

### Database Backup Operations

```bash
# 1. Create manual snapshot
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier omnirapeutic-prod-manual-$(date +%Y%m%d-%H%M) \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1

# 2. List available snapshots
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusterSnapshots[].[DBClusterSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table \
  --region us-east-1

# 3. Delete old manual snapshots (keep last 7 days)
OLD_SNAPSHOTS=$(aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier omnirapeutic-production \
  --snapshot-type manual \
  --query "DBClusterSnapshots[?SnapshotCreateTime<='$(date -u -d '7 days ago' +%Y-%m-%d)'].DBClusterSnapshotIdentifier" \
  --output text \
  --region us-east-1)

for snapshot in $OLD_SNAPSHOTS; do
  echo "Deleting snapshot: $snapshot"
  aws rds delete-db-cluster-snapshot \
    --db-cluster-snapshot-identifier $snapshot \
    --region us-east-1
done
```

### Database Monitoring

```bash
# Check Aurora Serverless scaling
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].ServerlessV2ScalingConfiguration' \
  --region us-east-1

# Check current capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ServerlessDatabaseCapacity \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region us-east-1

# Check database connections
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region us-east-1
```

### Running Database Migrations

```bash
# 1. Connect to bastion
aws ssm start-session --target $(terraform output -raw bastion_instance_id) --region us-east-1

# 2. Inside bastion, copy migration files
# (Assuming migrations are in S3 or can be git cloned)
aws s3 cp s3://omnirapeutic-migrations/v1.2.3/ ./migrations/ --recursive

# 3. Run migrations
cd migrations
./run-migrations.sh

# OR if using a migration tool:
# npm install -g db-migrate
# db-migrate up --config database.json
```

## Monitoring & Alerts

### Checking Alarm Status

```bash
# List all active alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --state-value ALARM \
  --query 'MetricAlarms[].[AlarmName,StateValue,StateReason]' \
  --output table \
  --region us-east-1

# Get alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name "omnirapeutic-production-aurora-cpu" \
  --history-item-type StateUpdate \
  --start-date $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --max-records 10 \
  --region us-east-1
```

### Silencing Alarms (Maintenance Mode)

```bash
# Disable alarm actions (silences notifications)
aws cloudwatch disable-alarm-actions \
  --alarm-names "omnirapeutic-production-ecs-cpu" \
  --region us-east-1

# Re-enable after maintenance
aws cloudwatch enable-alarm-actions \
  --alarm-names "omnirapeutic-production-ecs-cpu" \
  --region us-east-1
```

### Custom Metrics

```bash
# Publish custom metric
aws cloudwatch put-metric-data \
  --namespace Omnirapeutic/Application \
  --metric-name CustomBusinessMetric \
  --value 123 \
  --dimensions Environment=production,Service=api \
  --region us-east-1

# Query custom metric
aws cloudwatch get-metric-statistics \
  --namespace Omnirapeutic/Application \
  --metric-name CustomBusinessMetric \
  --dimensions Environment=production,Service=api \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum,Average \
  --region us-east-1
```

## Incident Response

### High CPU Alarm - ECS

**Alert**: omnirapeutic-production-ecs-cpu-high

**Response Steps**:
```bash
# 1. Check current CPU utilization
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].[serviceName,runningCount]' \
  --region us-east-1

# 2. Review CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=omnirapeutic-production-api Name=ClusterName,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region us-east-1

# 3. Check application logs for issues
aws logs tail /ecs/omnirapeutic-production/api --since 30m --region us-east-1

# 4. Scale up if needed
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --desired-count 4 \
  --region us-east-1
```

### High Database Connections

**Alert**: omnirapeutic-production-aurora-connections

**Response Steps**:
```bash
# 1. Check current connections
aws ssm start-session --target $(terraform output -raw bastion_instance_id) --region us-east-1

# Inside bastion:
psql -h <aurora-endpoint> -U admin -d omnirapeutic -c "
SELECT count(*) as connections, state
FROM pg_stat_activity
GROUP BY state;"

# 2. Identify long-running queries
psql -h <aurora-endpoint> -U admin -d omnirapeutic -c "
SELECT pid, usename, application_name, state,
       now() - query_start as duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC
LIMIT 10;"

# 3. Kill problematic connection if necessary
# psql -h <aurora-endpoint> -U admin -d omnirapeutic -c "
# SELECT pg_terminate_backend(PID);"
```

### WAF Blocked Requests Spike

**Alert**: omnirapeutic-production-waf-blocked-requests

**Response Steps**:
```bash
# 1. Check WAF sampled requests
aws wafv2 get-sampled-requests \
  --web-acl-arn $(terraform output -raw waf_web_acl_arn) \
  --rule-metric-name omnirapeutic-production-rate-limit \
  --scope REGIONAL \
  --time-window StartTime=$(date -u -d '1 hour ago' +%s),EndTime=$(date -u +%s) \
  --max-items 100 \
  --region us-east-1

# 2. Review top blocked IPs
aws logs filter-log-events \
  --log-group-name /aws/wafv2/omnirapeutic-production \
  --filter-pattern "BLOCK" \
  --start-time $(($(date +%s) - 3600))000 \
  --region us-east-1 | jq '.events[].message | fromjson | .httpRequest.clientIp' | sort | uniq -c | sort -nr

# 3. Adjust rate limit if legitimate traffic
# Update terraform variable and apply:
# rate_limit = 5000  # Increase from 2000
```

### Service Deployment Failure

**Issue**: New ECS deployment stuck or failing

**Response Steps**:
```bash
# 1. Check deployment status
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].deployments' \
  --region us-east-1

# 2. Check service events
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].events[:10]' \
  --region us-east-1

# 3. Check task failures
TASK_ARN=$(aws ecs list-tasks \
  --cluster omnirapeutic-production \
  --service-name omnirapeutic-production-api \
  --desired-status STOPPED \
  --query 'taskArns[0]' \
  --output text \
  --region us-east-1)

aws ecs describe-tasks \
  --cluster omnirapeutic-production \
  --tasks $TASK_ARN \
  --query 'tasks[0].[stoppedReason,containers[0].reason]' \
  --region us-east-1

# 4. Rollback to previous version
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service omnirapeutic-production-api \
  --task-definition omnirapeutic-production-api:N-1 \
  --force-new-deployment \
  --region us-east-1
```

## Maintenance Windows

### Scheduled Maintenance Procedure

**Standard Maintenance Window**: Sundays 02:00-06:00 UTC

```bash
# 1. Announce maintenance (2 hours before)
# - Post to status page
# - Send customer notifications
# - Update ALB health check to return 503

# 2. Disable alarm notifications
for alarm in $(aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --query 'MetricAlarms[].AlarmName' \
  --output text \
  --region us-east-1); do
  aws cloudwatch disable-alarm-actions --alarm-names $alarm --region us-east-1
done

# 3. Perform maintenance tasks
# - Deploy infrastructure updates
# - Run database migrations
# - Update task definitions
# - Scale services if needed

# 4. Verify health after maintenance
# Run health checks (see Daily Operations section)

# 5. Re-enable alarms
for alarm in $(aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --query 'MetricAlarms[].AlarmName' \
  --output text \
  --region us-east-1); do
  aws cloudwatch enable-alarm-actions --alarm-names $alarm --region us-east-1
done

# 6. Post-maintenance verification
# - Test key user workflows
# - Monitor logs for errors
# - Verify metrics are normal
```

### Aurora Maintenance

```bash
# Check pending maintenance
aws rds describe-pending-maintenance-actions \
  --resource-identifier arn:aws:rds:us-east-1:ACCOUNT:cluster:omnirapeutic-production \
  --region us-east-1

# Apply maintenance immediately (in maintenance window)
aws rds apply-pending-maintenance-action \
  --resource-identifier arn:aws:rds:us-east-1:ACCOUNT:cluster:omnirapeutic-production \
  --apply-action system-update \
  --opt-in-type immediate \
  --region us-east-1
```

## Emergency Procedures

### Complete Service Outage

```bash
# 1. Assess impact
# Check all services, ALB, database, and networking

# 2. Check recent changes
git log --since="2 hours ago" --oneline

# 3. Emergency rollback
terraform plan -destroy -target=module.ecs
terraform apply -auto-approve -target=module.ecs

# 4. Restore from backup if needed
# See disaster-recovery.md

# 5. Communicate status
# Update status page, notify customers
```

### Database Corruption

```bash
# 1. Immediately create snapshot
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier omnirapeutic-emergency-$(date +%Y%m%d-%H%M) \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1

# 2. Assess corruption
# Connect and run integrity checks

# 3. Restore from most recent good snapshot
# See disaster-recovery.md for detailed restore procedures
```

### Security Incident

```bash
# 1. Isolate affected resources
# Remove from ALB target group or shut down ECS tasks

# 2. Collect forensic data
# Save logs, snapshots, memory dumps

# 3. Review GuardDuty findings
aws guardduty list-findings \
  --detector-id $(terraform output -raw guardduty_detector_id) \
  --finding-criteria '{"Criterion":{"severity":{"Gte":1}}}' \
  --region us-east-1

# 4. Review CloudTrail for unauthorized access
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1

# 5. Rotate credentials
# Rotate all secrets in Secrets Manager
# Rotate IAM keys and roles
```

## Escalation Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| On-Call Engineer | PagerDuty | 24/7 |
| DevOps Lead | [Email/Phone] | Business Hours |
| Security Team | [Email/Phone] | 24/7 for P1 incidents |
| AWS Support | Enterprise Support Portal | 24/7 |

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial operations runbook |
