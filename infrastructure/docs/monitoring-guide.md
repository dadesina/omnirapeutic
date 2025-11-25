# Monitoring Guide - Omnirapeutic Production Infrastructure

## Table of Contents

1. [Monitoring Overview](#monitoring-overview)
2. [CloudWatch Alarms](#cloudwatch-alarms)
3. [Metrics Reference](#metrics-reference)
4. [Log Aggregation](#log-aggregation)
5. [Dashboards](#dashboards)
6. [Alert Configuration](#alert-configuration)
7. [Performance Monitoring](#performance-monitoring)

## Monitoring Overview

### Monitoring Stack

**AWS CloudWatch**: Primary monitoring and alerting platform
- **Metrics**: System and application metrics
- **Logs**: Centralized log aggregation
- **Alarms**: Threshold-based alerting
- **Dashboards**: Visual monitoring

**AWS Services**:
- **CloudTrail**: API audit logging
- **GuardDuty**: Threat detection
- **AWS Config**: Configuration compliance
- **VPC Flow Logs**: Network traffic analysis

### Current Monitoring Coverage

**Infrastructure**: 21 CloudWatch Alarms
- Aurora: 5 alarms (CPU, connections, memory, storage, replication)
- VPC: 3 alarms (NAT Gateway metrics)
- Cost: 1 alarm (monthly budget threshold)
- ALB: 3 alarms (response time, 5xx errors, unhealthy hosts)
- ECS: 3 alarms (CPU, memory, task count)
- WAF: 1 alarm (blocked requests)

**Log Groups**:
- ECS container logs
- VPC Flow Logs
- CloudTrail logs
- SSM Session logs
- Aurora PostgreSQL logs (when pgAudit enabled)

## CloudWatch Alarms

### Alarm Status Overview

```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --query 'MetricAlarms[].[AlarmName,StateValue,MetricName,Threshold]' \
  --output table \
  --region us-east-1

# Count alarms by state
aws cloudwatch describe-alarms \
  --alarm-name-prefix "omnirapeutic-production" \
  --query 'MetricAlarms[].StateValue' \
  --output text \
  --region us-east-1 | tr '\t' '\n' | sort | uniq -c
```

### Aurora Database Alarms

#### 1. High CPU Utilization
```bash
# Alarm: omnirapeutic-production-aurora-cpu
# Threshold: > 80% for 5 minutes
# Action: Scale up Aurora capacity or optimize queries

# Check current CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region us-east-1
```

**Response Actions**:
1. Identify slow queries via bastion
2. Check for missing indexes
3. Consider increasing max_capacity
4. Review connection pool settings

#### 2. High Database Connections
```bash
# Alarm: omnirapeutic-production-aurora-connections
# Threshold: > 80 connections for 5 minutes
# Aurora Serverless v2: ~90 connections per ACU

# Check current connections
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Maximum \
  --region us-east-1
```

**Response Actions**:
1. Review application connection pool configuration
2. Check for connection leaks
3. Increase Aurora capacity if needed
4. Close idle connections

#### 3. Low Freeable Memory
```bash
# Alarm: omnirapeutic-production-aurora-memory
# Threshold: < 512 MB for 5 minutes

# Check memory
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeableMemory \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Minimum \
  --region us-east-1
```

#### 4. Low Free Storage
```bash
# Alarm: omnirapeutic-production-aurora-storage
# Threshold: < 10 GB for 5 minutes

# Check storage
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeLocalStorage \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Minimum \
  --region us-east-1
```

#### 5. Replication Lag
```bash
# Alarm: omnirapeutic-production-aurora-replica-lag
# Threshold: > 1000 ms for 5 minutes
# Only applies if read replicas are configured

# Check lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name AuroraReplicaLag \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Maximum \
  --region us-east-1
```

### VPC Alarms

#### NAT Gateway Monitoring
```bash
# Alarms:
# - omnirapeutic-production-nat-error-port-allocation
# - omnirapeutic-production-nat-packets-drop-count
# - omnirapeutic-production-vpc-flow-logs-error

# Check NAT Gateway metrics
NAT_ID=$(terraform output -json nat_gateway_ids | jq -r '.[0]')
aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway \
  --metric-name ErrorPortAllocation \
  --dimensions Name=NatGatewayId,Value=$NAT_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

### ALB Alarms

#### 1. High Response Time
```bash
# Alarm: omnirapeutic-production-alb-response-time
# Threshold: > 2 seconds for 5 minutes

# Check response time
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=$(terraform output -raw alb_arn | cut -d'/' -f2-) \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region us-east-1
```

**Response Actions**:
1. Check ECS task CPU/memory
2. Review application performance
3. Scale ECS tasks
4. Check database query performance

#### 2. High 5XX Error Rate
```bash
# Alarm: omnirapeutic-production-alb-5xx-errors
# Threshold: > 10 errors per minute

# Check 5XX errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=$(terraform output -raw alb_arn | cut -d'/' -f2-) \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum \
  --region us-east-1
```

#### 3. Unhealthy Targets
```bash
# Alarm: omnirapeutic-production-alb-unhealthy-hosts
# Threshold: > 0 unhealthy hosts

# Check target health
ALB_ARN=$(terraform output -raw alb_arn)
TG_ARNS=$(aws elbv2 describe-target-groups \
  --load-balancer-arn $ALB_ARN \
  --query 'TargetGroups[].TargetGroupArn' \
  --output text \
  --region us-east-1)

for tg in $TG_ARNS; do
  echo "Target Group: $tg"
  aws elbv2 describe-target-health \
    --target-group-arn $tg \
    --region us-east-1
done
```

### ECS Alarms

#### 1. High CPU Utilization
```bash
# Alarm: omnirapeutic-production-ecs-cpu-high
# Threshold: > 80% for 5 minutes

# Check ECS CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=omnirapeutic-production-api Name=ClusterName,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-east-1
```

**Response Actions**:
1. Scale ECS service (increase desired count)
2. Increase task CPU allocation
3. Review application for CPU-intensive operations

#### 2. High Memory Utilization
```bash
# Alarm: omnirapeutic-production-ecs-memory-high
# Threshold: > 80% for 5 minutes

# Check ECS memory
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=omnirapeutic-production-api Name=ClusterName,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-east-1
```

#### 3. Task Count Too Low
```bash
# Alarm: omnirapeutic-production-ecs-task-count-low
# Threshold: < 1 running task for 5 minutes

# Check running tasks
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].[runningCount,desiredCount]' \
  --region us-east-1
```

### WAF Alarms

```bash
# Alarm: omnirapeutic-production-waf-blocked-requests
# Threshold: > 100 blocked requests in 5 minutes

# Check blocked requests
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=omnirapeutic-production-waf Name=Region,Value=us-east-1 Name=Rule,Value=ALL \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

### Cost Alarm

```bash
# Alarm: omnirapeutic-production-cost-threshold
# Threshold: > $1500 estimated monthly charges

# Check current costs
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --region us-east-1
```

## Metrics Reference

### Key Performance Indicators (KPIs)

| Metric | Normal Range | Warning | Critical | Action |
|--------|--------------|---------|----------|--------|
| Aurora CPU | 0-50% | 50-80% | >80% | Scale capacity |
| Aurora Connections | 0-50 | 50-80 | >80 | Check connection pool |
| Aurora Memory | >2 GB | 512MB-2GB | <512MB | Increase capacity |
| ECS CPU | 0-50% | 50-80% | >80% | Scale tasks |
| ECS Memory | 0-50% | 50-80% | >80% | Increase memory |
| ALB Response Time | <500ms | 500-2000ms | >2000ms | Investigate performance |
| ALB 5XX Errors | 0-5/min | 5-10/min | >10/min | Check application |
| WAF Blocked | <50/5min | 50-100/5min | >100/5min | Investigate attack |

### Custom Application Metrics

```bash
# Publish custom metric from application
aws cloudwatch put-metric-data \
  --namespace Omnirapeutic/Application \
  --metric-name ApiRequestCount \
  --value 123 \
  --dimensions Environment=production,Service=api,Endpoint=/users \
  --timestamp $(date -u +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1

# Query custom metric
aws cloudwatch get-metric-statistics \
  --namespace Omnirapeutic/Application \
  --metric-name ApiRequestCount \
  --dimensions Environment=production,Service=api \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

## Log Aggregation

### Log Groups

```bash
# List all log groups
aws logs describe-log-groups \
  --log-group-name-prefix "/aws" \
  --query 'logGroups[].[logGroupName,storedBytes,retentionInDays]' \
  --output table \
  --region us-east-1
```

**Current Log Groups**:
- `/ecs/omnirapeutic-production/api` (30 days retention)
- `/ecs/omnirapeutic-production/web` (30 days retention)
- `/ecs/omnirapeutic-production/worker` (30 days retention)
- `/aws/vpc/omnirapeutic-production-flow-logs` (90 days)
- `/aws/cloudtrail/omnirapeutic-production` (90 days)
- `/aws/ssm/omnirapeutic-production-bastion-sessions` (90 days)
- `/aws/rds/cluster/omnirapeutic-production/postgresql` (90 days)

### Log Queries

#### Search Application Errors
```bash
# Tail logs in real-time
aws logs tail /ecs/omnirapeutic-production/api \
  --follow \
  --filter-pattern "ERROR" \
  --region us-east-1

# Count errors in last hour
aws logs filter-log-events \
  --log-group-name /ecs/omnirapeutic-production/api \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "ERROR" \
  --query 'length(events)' \
  --region us-east-1

# Find specific error
aws logs filter-log-events \
  --log-group-name /ecs/omnirapeutic-production/api \
  --start-time $(($(date +%s) - 86400))000 \
  --filter-pattern "DatabaseError" \
  --query 'events[*].[timestamp,message]' \
  --output text \
  --region us-east-1
```

#### Analyze VPC Flow Logs
```bash
# Find rejected connections
aws logs filter-log-events \
  --log-group-name /aws/vpc/omnirapeutic-production-flow-logs \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "[version, account, eni, source, destination, srcport, destport, protocol, packets, bytes, windowstart, windowend, action=REJECT, flowlogstatus]" \
  --region us-east-1

# Top talkers
aws logs filter-log-events \
  --log-group-name /aws/vpc/omnirapeutic-production-flow-logs \
  --start-time $(($(date +%s) - 3600))000 \
  --query 'events[*].message' \
  --output text \
  --region us-east-1 | awk '{print $4}' | sort | uniq -c | sort -nr | head -10
```

#### Audit CloudTrail Events
```bash
# Recent API calls
aws logs filter-log-events \
  --log-group-name /aws/cloudtrail/omnirapeutic-production \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "{ $.errorCode = \"*\" }" \
  --region us-east-1

# User activity
aws logs filter-log-events \
  --log-group-name /aws/cloudtrail/omnirapeutic-production \
  --start-time $(($(date +%s) - 86400))000 \
  --filter-pattern "{ $.userIdentity.userName = \"admin\" }" \
  --region us-east-1
```

### CloudWatch Insights Queries

```bash
# Run Insights query
aws logs start-query \
  --log-group-name /ecs/omnirapeutic-production/api \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)
' \
  --region us-east-1
```

**Useful Queries**:

1. **Top 10 Errors**:
```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() as errorCount by @message
| sort errorCount desc
| limit 10
```

2. **Slow Requests**:
```
fields @timestamp, duration, endpoint
| filter duration > 2000
| sort duration desc
| limit 20
```

3. **Request Rate**:
```
fields @timestamp
| stats count() as requestCount by bin(1m)
```

## Dashboards

### Create Custom Dashboard

```bash
# Create dashboard JSON
cat > dashboard.json <<'EOF'
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/RDS", "CPUUtilization", {"stat": "Average", "label": "Aurora CPU"}]
        ],
        "period": 300,
        "region": "us-east-1",
        "title": "Aurora CPU Utilization"
      }
    }
  ]
}
EOF

# Create dashboard
aws cloudwatch put-dashboard \
  --dashboard-name omnirapeutic-production \
  --dashboard-body file://dashboard.json \
  --region us-east-1
```

### Recommended Dashboard Widgets

1. **Aurora Performance**: CPU, Connections, Memory, IOPS
2. **ECS Performance**: CPU, Memory, Task Count
3. **ALB Metrics**: Request Count, Response Time, 5XX Errors
4. **WAF Protection**: Allowed vs Blocked Requests
5. **Cost Tracking**: Estimated Monthly Charges

## Alert Configuration

### SNS Topic Configuration

```bash
# Get SNS topic ARN
SNS_TOPIC=$(terraform output -raw alarms_sns_topic_arn)

# Subscribe email
aws sns subscribe \
  --topic-arn $SNS_TOPIC \
  --protocol email \
  --notification-endpoint ops-team@omnirapeutic.com \
  --region us-east-1

# Confirm subscription via email

# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn $SNS_TOPIC \
  --region us-east-1

# Test notification
aws sns publish \
  --topic-arn $SNS_TOPIC \
  --message "Test alarm notification from Omnirapeutic monitoring" \
  --subject "Test Alarm" \
  --region us-east-1
```

### Notification Channels

**Supported Protocols**:
- Email
- SMS
- HTTPS webhook
- Lambda function
- SQS queue

**Example: Slack Integration**:
```bash
# Subscribe HTTPS webhook to SNS
aws sns subscribe \
  --topic-arn $SNS_TOPIC \
  --protocol https \
  --notification-endpoint https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  --region us-east-1
```

## Performance Monitoring

### Application Performance

```bash
# Monitor container metrics
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].[serviceName,runningCount,desiredCount]' \
  --region us-east-1

# Get task ARNs
TASK_ARNS=$(aws ecs list-tasks \
  --cluster omnirapeutic-production \
  --service-name omnirapeutic-production-api \
  --desired-status RUNNING \
  --query 'taskArns' \
  --output text \
  --region us-east-1)

# Get task details
for task in $TASK_ARNS; do
  aws ecs describe-tasks \
    --cluster omnirapeutic-production \
    --tasks $task \
    --query 'tasks[0].[cpu,memory,lastStatus]' \
    --region us-east-1
done
```

### Database Performance

```bash
# Connect to Aurora via bastion
psql -h <aurora-endpoint> -U admin -d omnirapeutic

# Check active queries
SELECT pid, usename, application_name, state,
       now() - query_start as duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

# Check table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial monitoring guide |
