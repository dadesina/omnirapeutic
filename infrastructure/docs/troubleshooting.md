# Troubleshooting Guide - Omnirapeutic Production Infrastructure

## Table of Contents

1. [ECS Service Issues](#ecs-service-issues)
2. [Load Balancer Problems](#load-balancer-problems)
3. [Database Connectivity](#database-connectivity)
4. [Networking Issues](#networking-issues)
5. [WAF Blocking Legitimate Traffic](#waf-blocking-legitimate-traffic)
6. [Performance Issues](#performance-issues)
7. [Deployment Failures](#deployment-failures)
8. [Monitoring & Alarms](#monitoring--alarms)

## ECS Service Issues

### Problem: ECS Tasks Failing to Start

**Symptoms**:
- ECS service shows 0/2 running tasks
- Tasks transition from PENDING to STOPPED
- Service events show "failed to launch"

**Diagnostic Steps**:
```bash
# 1. Check service events
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services omnirapeutic-production-api \
  --query 'services[0].events[:10]' \
  --region us-east-1

# 2. Get stopped task details
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
  --query 'tasks[0].[stopCode,stoppedReason,containers[0].reason,containers[0].exitCode]' \
  --region us-east-1

# 3. Check CloudWatch logs for container errors
aws logs tail /ecs/omnirapeutic-production/api \
  --since 30m \
  --filter-pattern "ERROR" \
  --region us-east-1
```

**Common Causes & Solutions**:

1. **Insufficient CPU/Memory**:
```bash
# Solution: Increase task resources
# Edit task definition, increase cpu/memory values
# Re-register task definition and update service
```

2. **Image Pull Error**:
```bash
# Check ECR repository and permissions
aws ecr describe-repositories \
  --repository-names omnirapeutic-production-api \
  --region us-east-1

# Verify task execution role has ECR permissions
aws iam get-role-policy \
  --role-name omnirapeutic-production-ecs-task-execution-role \
  --policy-name ECSTaskExecutionPolicy \
  --region us-east-1
```

3. **Subnet IP Exhaustion**:
```bash
# Check available IPs in subnets
for subnet in $(terraform output -json vpc_id | jq -r '.private_app_subnet_ids[]'); do
  aws ec2 describe-subnets --subnet-ids $subnet \
    --query 'Subnets[0].[SubnetId,AvailableIpAddressCount]' \
    --region us-east-1
done

# Solution: Expand CIDR or add more subnets
```

4. **Failed Health Checks**:
```bash
# Check container health check configuration
aws ecs describe-task-definition \
  --task-definition omnirapeutic-production-api \
  --query 'taskDefinition.containerDefinitions[0].healthCheck' \
  --region us-east-1

# Solution: Adjust health check parameters (timeout, retries, startPeriod)
```

### Problem: Tasks Restarting Frequently

**Symptoms**:
- High task churn (tasks repeatedly stopping and starting)
- Application logs show crashes or OOM errors

**Diagnostic Steps**:
```bash
# Check task stop reasons
aws ecs list-tasks \
  --cluster omnirapeutic-production \
  --service-name omnirapeutic-production-api \
  --desired-status STOPPED \
  --region us-east-1 | \
  jq -r '.taskArns[]' | \
  head -5 | \
  xargs -I {} aws ecs describe-tasks \
    --cluster omnirapeutic-production \
    --tasks {} \
    --query 'tasks[0].[stoppedReason,containers[0].exitCode]' \
    --region us-east-1

# Check memory utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=omnirapeutic-production-api Name=ClusterName,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Maximum \
  --region us-east-1
```

**Solutions**:

1. **Out of Memory (OOM)**:
```bash
# Increase task memory
# Update task definition memory from 1024 to 2048
aws ecs register-task-definition \
  --cli-input-json file://api-task-definition-increased-memory.json \
  --region us-east-1
```

2. **Application Crashes**:
```bash
# Review application logs for stack traces
aws logs tail /ecs/omnirapeutic-production/api --since 1h --region us-east-1

# Check for unhandled exceptions, database connection errors, etc.
```

## Load Balancer Problems

### Problem: ALB Returns 502/503 Errors

**Symptoms**:
- Users receive "Bad Gateway" or "Service Unavailable" errors
- ALB 5XX error CloudWatch alarm triggered

**Diagnostic Steps**:
```bash
# 1. Check target group health
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

# 2. Check ALB access logs (if enabled)
# aws s3 cp s3://omnirapeutic-alb-logs/AWSLogs/.../$(date +%Y/%m/%d)/ . --recursive

# 3. Check security group rules
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw alb_security_group_id) \
  --query 'SecurityGroups[0].IpPermissions' \
  --region us-east-1
```

**Common Causes & Solutions**:

1. **All Targets Unhealthy**:
```bash
# Check health check configuration
aws elbv2 describe-target-groups \
  --target-group-arns $TG_ARN \
  --query 'TargetGroups[0].HealthCheckPath' \
  --region us-east-1

# Solution: Fix application health endpoint or adjust health check path
terraform apply  # After updating health_check block in alb module
```

2. **Security Group Misconfiguration**:
```bash
# Verify ALB can reach ECS tasks
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw ecs_security_group_id) \
  --query 'SecurityGroups[0].IpPermissions' \
  --region us-east-1

# Should see rule allowing traffic from ALB security group
# If missing, add security group rule
```

3. **Connection Timeout**:
```bash
# Check ALB idle timeout (default 60s)
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn $ALB_ARN \
  --query 'Attributes[?Key==`idle_timeout.timeout_seconds`]' \
  --region us-east-1

# Increase if needed
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn $ALB_ARN \
  --attributes Key=idle_timeout.timeout_seconds,Value=120 \
  --region us-east-1
```

### Problem: ALB Not Receiving Traffic

**Symptoms**:
- Cannot reach ALB DNS name
- Connection timeout or DNS resolution fails

**Diagnostic Steps**:
```bash
# 1. Verify ALB exists and is active
aws elbv2 describe-load-balancers \
  --load-balancer-arns $(terraform output -raw alb_arn) \
  --query 'LoadBalancers[0].[State.Code,Scheme]' \
  --region us-east-1

# 2. Check DNS resolution
ALB_DNS=$(terraform output -raw alb_dns_name)
nslookup $ALB_DNS

# 3. Test connectivity
curl -v http://$ALB_DNS/

# 4. Check security group allows inbound traffic
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw alb_security_group_id) \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`80`]' \
  --region us-east-1
```

**Solutions**:

1. **ALB in Wrong Subnets**:
```bash
# Verify ALB is in public subnets
aws elbv2 describe-load-balancers \
  --load-balancer-arns $(terraform output -raw alb_arn) \
  --query 'LoadBalancers[0].AvailabilityZones[].SubnetId' \
  --region us-east-1

# Compare with public subnet IDs from terraform output
```

2. **No Internet Gateway**:
```bash
# Verify VPC has IGW attached
VPC_ID=$(terraform output -raw vpc_id)
aws ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --region us-east-1
```

## Database Connectivity

### Problem: Cannot Connect to Aurora

**Symptoms**:
- Application logs show "Connection timeout" or "Connection refused"
- ECS tasks unable to reach database

**Diagnostic Steps**:
```bash
# 1. Connect to bastion
aws ssm start-session \
  --target $(terraform output -raw bastion_instance_id) \
  --region us-east-1

# 2. Test database connectivity from bastion
AURORA_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint)
nc -zv $AURORA_ENDPOINT 5432

# 3. Check Aurora cluster status
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].[Status,Endpoint]' \
  --region us-east-1

# 4. Check security group rules
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw aurora_security_group_id) \
  --query 'SecurityGroups[0].IpPermissions' \
  --region us-east-1
```

**Common Causes & Solutions**:

1. **Security Group Missing Ingress Rule**:
```bash
# Verify ECS security group has access to Aurora
aws ec2 describe-security-group-rules \
  --filters Name=group-id,Values=$(terraform output -raw aurora_security_group_id) \
  --query 'SecurityGroupRules[?FromPort==`5432`]' \
  --region us-east-1

# If missing, check terraform configuration for aws_security_group_rule.aurora_from_ecs
terraform apply  # Re-apply to add missing rule
```

2. **Wrong Database Endpoint**:
```bash
# Verify application is using cluster endpoint (not reader endpoint)
CLUSTER_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint)
echo "Cluster endpoint: $CLUSTER_ENDPOINT"

# Check application configuration/secrets
aws secretsmanager get-secret-value \
  --secret-id omnirapeutic/production/database-url \
  --region us-east-1
```

3. **Aurora Cluster Stopped/Paused**:
```bash
# Check cluster status
aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Status' \
  --output text \
  --region us-east-1

# If stopped, start it
aws rds start-db-cluster \
  --db-cluster-identifier omnirapeutic-production \
  --region us-east-1
```

### Problem: Database Performance Issues

**Symptoms**:
- Slow query responses
- High database CPU utilization
- Connection pool exhaustion

**Diagnostic Steps**:
```bash
# 1. Check Aurora Serverless capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ServerlessDatabaseCapacity \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region us-east-1

# 2. Check CPU utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBClusterIdentifier,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region us-east-1

# 3. Connect to database and check for slow queries
psql -h $AURORA_ENDPOINT -U admin -d omnirapeutic -c "
SELECT pid, usename, query_start, state, query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '30 seconds'
ORDER BY query_start
LIMIT 10;"
```

**Solutions**:

1. **Increase Aurora Capacity**:
```bash
# Update max_capacity in terraform.tfvars
# aurora_max_capacity = 2.0  # Increase from 1.0

terraform apply
```

2. **Identify and Optimize Slow Queries**:
```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slowest queries
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Add indexes or optimize queries as needed
```

3. **Check Connection Pool Settings**:
```bash
# Review application connection pool configuration
# Ensure max connections don't exceed Aurora limits
# Aurora Serverless v2: ~90 connections per ACU
```

## Networking Issues

### Problem: NAT Gateway Connectivity Failures

**Symptoms**:
- Private subnet resources cannot reach internet
- ECR image pulls fail
- Secrets Manager access fails

**Diagnostic Steps**:
```bash
# 1. Check NAT Gateway status
NAT_IDS=$(terraform output -json nat_gateway_ids | jq -r '.[]')
for nat in $NAT_IDS; do
  aws ec2 describe-nat-gateways \
    --nat-gateway-ids $nat \
    --query 'NatGateways[0].[NatGatewayId,State]' \
    --region us-east-1
done

# 2. Check route tables
VPC_ID=$(terraform output -raw vpc_id)
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[].[RouteTableId,Routes[?DestinationCidrBlock==`0.0.0.0/0`].NatGatewayId]' \
  --region us-east-1

# 3. Test from bastion
aws ssm start-session --target $(terraform output -raw bastion_instance_id) --region us-east-1
# Inside bastion:
curl -I https://www.google.com
```

**Solutions**:

1. **NAT Gateway Deleted or Failed**:
```bash
# Re-create NAT Gateway via terraform
terraform taint module.vpc.aws_nat_gateway.main[0]
terraform apply
```

2. **Route Table Misconfiguration**:
```bash
# Verify private subnet route tables point to NAT Gateway
# Should see 0.0.0.0/0 → nat-xxxxx in private subnet routes
# Fix in terraform and re-apply if needed
```

### Problem: VPC Flow Logs Not Capturing Traffic

**Diagnostic Steps**:
```bash
# 1. Check flow logs status
aws ec2 describe-flow-logs \
  --filter "Name=resource-id,Values=$(terraform output -raw vpc_id)" \
  --region us-east-1

# 2. Check CloudWatch log group
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/vpc/omnirapeutic" \
  --region us-east-1

# 3. Verify IAM role permissions
aws iam get-role \
  --role-name omnirapeutic-production-vpc-flow-logs-role \
  --region us-east-1
```

## WAF Blocking Legitimate Traffic

### Problem: WAF Blocking Valid Requests

**Symptoms**:
- Users report 403 Forbidden errors
- Specific features/endpoints not working
- High WAF blocked requests metric

**Diagnostic Steps**:
```bash
# 1. Check sampled blocked requests
aws wafv2 get-sampled-requests \
  --web-acl-arn $(terraform output -raw waf_web_acl_arn) \
  --rule-metric-name omnirapeutic-production-common-rules \
  --scope REGIONAL \
  --time-window StartTime=$(date -u -d '1 hour ago' +%s),EndTime=$(date -u +%s) \
  --max-items 20 \
  --region us-east-1

# 2. Identify specific rule causing blocks
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=omnirapeutic-production-waf Name=Region,Value=us-east-1 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

**Solutions**:

1. **Rate Limiting Too Aggressive**:
```bash
# Temporarily increase rate limit
# Edit modules/waf/main.tf
# Change rate_based_statement.limit from 2000 to 5000

terraform apply -target=module.waf
```

2. **False Positive from Managed Rule**:
```hcl
# Add exclusion rule in modules/waf/main.tf
rule {
  name     = "AWSManagedRulesCommonRuleSet"
  priority = 1

  override_action {
    none {}
  }

  statement {
    managed_rule_group_statement {
      name        = "AWSManagedRulesCommonRuleSet"
      vendor_name = "AWS"

      # Exclude specific rule
      excluded_rule {
        name = "SizeRestrictions_BODY"
      }
    }
  }
}

# Apply changes
terraform apply -target=module.waf
```

3. **Whitelist Specific IP**:
```bash
# Create IP set for whitelisted IPs
aws wafv2 create-ip-set \
  --name omnirapeutic-whitelist \
  --scope REGIONAL \
  --ip-address-version IPV4 \
  --addresses 203.0.113.0/24 \
  --region us-east-1

# Add rule to WebACL allowing whitelisted IPs (update terraform)
```

## Performance Issues

### Problem: High Response Times

**Diagnostic Steps**:
```bash
# 1. Check ALB response time
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=$(terraform output -raw alb_arn_suffix) \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region us-east-1

# 2. Check ECS CPU/Memory
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=omnirapeutic-production-api Name=ClusterName,Value=omnirapeutic-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region us-east-1

# 3. Check database query performance
# Connect via bastion and run slow query analysis (see Database section)
```

**Solutions**:
- Scale ECS tasks
- Increase task CPU/memory
- Optimize database queries
- Add caching layer (ElastiCache)

## Deployment Failures

### Problem: Terraform Apply Fails

**Common Errors**:

1. **State Lock Error**:
```bash
Error: Error acquiring the state lock
```
**Solution**:
```bash
# If no other terraform process is running:
terraform force-unlock <LOCK_ID>
```

2. **Resource Already Exists**:
```bash
Error: resource already exists
```
**Solution**:
```bash
# Import existing resource
terraform import module.vpc.aws_vpc.main <vpc-id>
```

3. **Dependency Violation**:
```bash
Error: deleting resource: DependencyViolation
```
**Solution**:
```bash
# Manually delete dependent resources first
# Or use terraform destroy -target for specific modules
```

## Monitoring & Alarms

### Problem: False Positive Alarms

**Solutions**:
```bash
# Adjust alarm thresholds
# Edit modules/alarms/main.tf, modify threshold values
# For example, increase CPU alarm from 80% to 90%

terraform apply -target=module.alarms

# Or temporarily disable alarm
aws cloudwatch disable-alarm-actions \
  --alarm-names "omnirapeutic-production-ecs-cpu-high" \
  --region us-east-1
```

### Problem: Missing Alarm Notifications

**Diagnostic Steps**:
```bash
# 1. Check SNS subscription
SNS_TOPIC=$(terraform output -raw alarms_sns_topic_arn)
aws sns list-subscriptions-by-topic \
  --topic-arn $SNS_TOPIC \
  --region us-east-1

# 2. Check subscription confirmation status
# Look for "PendingConfirmation" - need to click email confirmation link

# 3. Test notification
aws sns publish \
  --topic-arn $SNS_TOPIC \
  --message "Test alarm notification" \
  --subject "Test Alarm" \
  --region us-east-1
```

## Getting Help

If you cannot resolve an issue using this guide:

1. **Check AWS Service Health Dashboard**: https://status.aws.amazon.com/
2. **Review AWS Support Cases**: Open enterprise support case if needed
3. **Escalate to On-Call Engineer**: Use PagerDuty for P1/P2 incidents
4. **Consult CloudTrail**: Review recent API calls for unexpected changes

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial troubleshooting guide |
