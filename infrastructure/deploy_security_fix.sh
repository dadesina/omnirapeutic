#!/bin/bash
set -e

echo "=== Deploying Security Fix (Migration 012) ==="
echo "Date: $(date)"
echo ""

# Get Aurora endpoint and credentials
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Endpoint' \
  --output text 2>/dev/null)

if [ -z "$AURORA_ENDPOINT" ]; then
  echo "ERROR: Could not retrieve Aurora endpoint"
  exit 1
fi

echo "Aurora Endpoint: $AURORA_ENDPOINT"
echo ""

# Get database password from Secrets Manager
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id omnirapeutic/production/aurora/master-password \
  --query 'SecretString' \
  --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: Could not retrieve database password"
  exit 1
fi

echo "Credentials retrieved successfully"
echo ""

# Upload migration to S3 for bastion access
S3_BUCKET=$(aws cloudtrail describe-trails \
  --query 'trailList[0].S3BucketName' \
  --output text 2>/dev/null)

if [ -z "$S3_BUCKET" ]; then
  echo "ERROR: Could not find S3 bucket"
  exit 1
fi

echo "Uploading migration to S3..."
aws s3 cp migrations/012_fix_security_definer.sql s3://$S3_BUCKET/migrations/

# Get bastion instance ID
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=omnirapeutic-production-bastion" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null)

if [ -z "$BASTION_ID" ] || [ "$BASTION_ID" == "None" ]; then
  echo "ERROR: No running bastion instance found"
  exit 1
fi

echo "Bastion Instance: $BASTION_ID"
echo ""

# Create deployment script for bastion
cat > /tmp/bastion_security_fix.sh << 'BASTION_EOF'
#!/bin/bash
set -e

echo "=== Running Security Fix Deployment on Bastion ==="

# Download migration from S3
aws s3 cp s3://S3_BUCKET_PLACEHOLDER/migrations/012_fix_security_definer.sql /tmp/

# Set environment variables
export PGPASSWORD='DB_PASSWORD_PLACEHOLDER'
export AURORA_ENDPOINT='AURORA_ENDPOINT_PLACEHOLDER'

echo "Connecting to Aurora..."
psql "host=$AURORA_ENDPOINT port=5432 dbname=omnirapeutic user=postgres sslmode=require" \
  -f /tmp/012_fix_security_definer.sql

echo ""
echo "=== Security Fix Deployed Successfully ==="
echo ""

# Verify functions exist
echo "Verifying functions..."
psql "host=$AURORA_ENDPOINT port=5432 dbname=omnirapeutic user=postgres sslmode=require" << 'SQL'
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'app'
  AND routine_name IN ('reserve_session_units', 'adjust_authorization_units', 'cleanup_stale_reservations')
ORDER BY routine_name;
SQL

echo ""
echo "Security fix validation complete!"
BASTION_EOF

# Replace placeholders
sed -i "s|S3_BUCKET_PLACEHOLDER|$S3_BUCKET|g" /tmp/bastion_security_fix.sh
sed -i "s|DB_PASSWORD_PLACEHOLDER|$DB_PASSWORD|g" /tmp/bastion_security_fix.sh
sed -i "s|AURORA_ENDPOINT_PLACEHOLDER|$AURORA_ENDPOINT|g" /tmp/bastion_security_fix.sh

# Upload script to S3
echo "Uploading deployment script to S3..."
aws s3 cp /tmp/bastion_security_fix.sh s3://$S3_BUCKET/scripts/

# Execute on bastion via SSM
echo ""
echo "Executing security fix on bastion..."
echo ""

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$BASTION_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    'aws s3 cp s3://$S3_BUCKET/scripts/bastion_security_fix.sh /tmp/',
    'chmod +x /tmp/bastion_security_fix.sh',
    '/tmp/bastion_security_fix.sh'
  ]" \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
echo ""
echo "Waiting for command to complete..."
sleep 5

# Check command status
for i in {1..30}; do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$BASTION_ID" \
    --query 'Status' \
    --output text 2>/dev/null || echo "Pending")
  
  echo "Status: $STATUS (attempt $i/30)"
  
  if [ "$STATUS" == "Success" ]; then
    echo ""
    echo "=== Deployment Successful ==="
    echo ""
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$BASTION_ID" \
      --query 'StandardOutputContent' \
      --output text
    exit 0
  elif [ "$STATUS" == "Failed" ]; then
    echo ""
    echo "=== Deployment Failed ==="
    echo ""
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$BASTION_ID" \
      --query 'StandardErrorContent' \
      --output text
    exit 1
  fi
  
  sleep 10
done

echo "Timeout waiting for command completion"
exit 1
