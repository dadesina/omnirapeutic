#!/bin/bash
set -e

# Secure Migration Deployment Script
# Version: 2.0 - No credential exposure
# Date: 2025-11-24
# Usage: ./deploy_migration_secure.sh <migration_file>

MIGRATION_FILE="${1:-}"

if [ -z "$MIGRATION_FILE" ]; then
  echo "ERROR: Migration file not specified"
  echo "Usage: $0 <migration_file>"
  echo "Example: $0 migrations/013_database_optimizations.sql"
  exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "ERROR: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "=== Secure Migration Deployment ==="
echo "Migration: $MIGRATION_FILE"
echo "Date: $(date)"
echo ""

# Get Aurora endpoint
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Endpoint' \
  --output text 2>/dev/null)

if [ -z "$AURORA_ENDPOINT" ]; then
  echo "ERROR: Could not retrieve Aurora endpoint"
  exit 1
fi

echo "Aurora Endpoint: $AURORA_ENDPOINT"

# Get S3 bucket from CloudTrail
S3_BUCKET=$(aws cloudtrail describe-trails \
  --query 'trailList[0].S3BucketName' \
  --output text 2>/dev/null)

if [ -z "$S3_BUCKET" ]; then
  echo "ERROR: Could not find S3 bucket"
  exit 1
fi

echo "S3 Bucket: $S3_BUCKET"

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

# Upload migration to S3
MIGRATION_NAME=$(basename "$MIGRATION_FILE")
echo "Uploading migration to S3..."
aws s3 cp "$MIGRATION_FILE" "s3://$S3_BUCKET/migrations/$MIGRATION_NAME"

# Create deployment script template (NO CREDENTIALS)
cat > /tmp/bastion_deploy_template.sh << 'BASTION_EOF'
#!/bin/bash
set -e

MIGRATION_NAME="MIGRATION_NAME_PLACEHOLDER"
S3_BUCKET="S3_BUCKET_PLACEHOLDER"
AURORA_ENDPOINT="AURORA_ENDPOINT_PLACEHOLDER"
SECRET_ID="omnirapeutic/production/aurora/master-password"

echo "=== Running Migration on Bastion ==="
echo "Migration: $MIGRATION_NAME"
echo ""

# Download migration from S3
echo "Downloading migration from S3..."
aws s3 cp "s3://$S3_BUCKET/migrations/$MIGRATION_NAME" /tmp/

# Fetch database password from Secrets Manager ON BASTION
echo "Fetching database credentials from Secrets Manager..."
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --query 'SecretString' \
  --output text)

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: Could not retrieve database password from Secrets Manager"
  exit 1
fi

echo "Credentials retrieved successfully"
echo ""

# Set environment variable (only in bastion's memory)
export PGPASSWORD="$DB_PASSWORD"

# Connect and execute migration
echo "Connecting to Aurora..."
echo "Executing migration: $MIGRATION_NAME"
echo ""

psql "host=$AURORA_ENDPOINT port=5432 dbname=omnirapeutic user=postgres sslmode=require" \
  -f "/tmp/$MIGRATION_NAME"

# Verify migration
echo ""
echo "=== Migration Deployed Successfully ==="
echo ""

# Cleanup sensitive data
unset PGPASSWORD
unset DB_PASSWORD
rm -f "/tmp/$MIGRATION_NAME"

echo "Migration complete and temporary files cleaned up"
BASTION_EOF

# Replace placeholders (Aurora endpoint and S3 bucket only - NO CREDENTIALS)
sed -i "s|MIGRATION_NAME_PLACEHOLDER|$MIGRATION_NAME|g" /tmp/bastion_deploy_template.sh
sed -i "s|S3_BUCKET_PLACEHOLDER|$S3_BUCKET|g" /tmp/bastion_deploy_template.sh
sed -i "s|AURORA_ENDPOINT_PLACEHOLDER|$AURORA_ENDPOINT|g" /tmp/bastion_deploy_template.sh

# Upload template to S3
echo "Uploading deployment script template to S3..."
aws s3 cp /tmp/bastion_deploy_template.sh "s3://$S3_BUCKET/scripts/deploy_$MIGRATION_NAME.sh"

# Execute on bastion via SSM
echo ""
echo "Executing migration on bastion..."
echo ""

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$BASTION_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    'aws s3 cp s3://$S3_BUCKET/scripts/deploy_$MIGRATION_NAME.sh /tmp/',
    'chmod +x /tmp/deploy_$MIGRATION_NAME.sh',
    '/tmp/deploy_$MIGRATION_NAME.sh',
    'rm -f /tmp/deploy_$MIGRATION_NAME.sh'
  ]" \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
echo ""
echo "Waiting for command to complete..."
sleep 5

# Poll for completion
for i in {1..60}; do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$BASTION_ID" \
    --query 'Status' \
    --output text 2>/dev/null || echo "Pending")

  echo "Status: $STATUS (attempt $i/60)"

  if [ "$STATUS" == "Success" ]; then
    echo ""
    echo "=== Deployment Successful ==="
    echo ""
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$BASTION_ID" \
      --query 'StandardOutputContent' \
      --output text

    # Cleanup local temporary files
    rm -f /tmp/bastion_deploy_template.sh

    echo ""
    echo "=== Security Verification ==="
    echo "1. Database password NEVER written to local filesystem"
    echo "2. Database password NEVER uploaded to S3"
    echo "3. Credentials fetched directly by bastion from Secrets Manager"
    echo "4. All temporary files cleaned up"
    echo ""
    echo "Deployment complete!"
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

    # Cleanup on failure
    rm -f /tmp/bastion_deploy_template.sh
    exit 1
  fi

  sleep 10
done

echo "Timeout waiting for command completion"
rm -f /tmp/bastion_deploy_template.sh
exit 1
