#!/bin/bash
# Deploy Database Migrations via Bastion Host
# Sprint 4 Phase 1A: Database Foundation
# Date: 2025-11-24

set -e

echo "=========================================="
echo "Bastion Host Deployment"
echo "Sprint 4 Phase 1A"
echo "=========================================="
echo ""

BASTION_ID="i-0f6b7bae60da49bb0"
DB_HOST="omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com"
DB_USER="admin"
DB_NAME="omnirapeutic"
DB_PASSWORD="$1"

if [ -z "$DB_PASSWORD" ]; then
  echo "Error: Database password not provided"
  echo "Usage: $0 <database_password>"
  exit 1
fi

echo "Step 1: Preparing migration package..."
cd /root/projects/omnirapeutic/infrastructure
tar czf /tmp/migrations.tar.gz migrations/
echo "✓ Migration files packaged"
echo ""

echo "Step 2: Creating deployment script for bastion..."
cat > /tmp/bastion_deploy.sh << 'BASTION_SCRIPT'
#!/bin/bash
set -e

DB_PASSWORD="$1"

# Install PostgreSQL client if not present
if ! command -v psql &> /dev/null; then
  echo "Installing PostgreSQL client..."
  sudo apt-get update -qq
  sudo apt-get install -y postgresql-client
fi

# Extract migrations
cd /tmp
tar xzf migrations.tar.gz

# Create .pgpass
export PGPASSFILE="/tmp/.pgpass_deploy"
echo "omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com:5432:omnirapeutic:admin:$DB_PASSWORD" > $PGPASSFILE
chmod 600 $PGPASSFILE

echo "Testing database connection..."
psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
     -U admin -d omnirapeutic -c "SELECT version();" > /dev/null

if [ $? -eq 0 ]; then
  echo "✓ Database connection successful"
else
  echo "✗ Database connection failed"
  exit 1
fi

echo ""
echo "Executing migrations..."
for migration in $(ls -1 /tmp/migrations/*.sql | sort); do
  MIGRATION_NAME=$(basename $migration)
  echo "Executing: $MIGRATION_NAME"

  psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
       -U admin -d omnirapeutic -f $migration

  if [ $? -eq 0 ]; then
    echo "✓ $MIGRATION_NAME completed"
  else
    echo "✗ $MIGRATION_NAME failed"
    exit 1
  fi
done

echo ""
echo "Verification:"
psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
     -U admin -d omnirapeutic -c "SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

# Cleanup
rm -f $PGPASSFILE
rm -rf /tmp/migrations/

echo ""
echo "Deployment complete!"
BASTION_SCRIPT

chmod +x /tmp/bastion_deploy.sh
echo "✓ Bastion deployment script created"
echo ""

echo "Step 3: Uploading files to bastion via SSM..."
echo "Creating command document..."

# Use SSM Send-Command to upload and execute
COMMAND_ID=$(aws ssm send-command \
  --instance-ids $BASTION_ID \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    \"mkdir -p /tmp/db-deployment\",
    \"cat > /tmp/db-deployment/migrations.tar.gz.b64 << 'EOF'\",
    \"$(base64 < /tmp/migrations.tar.gz)\",
    \"EOF\",
    \"base64 -d /tmp/db-deployment/migrations.tar.gz.b64 > /tmp/migrations.tar.gz\",
    \"cat > /tmp/bastion_deploy.sh << 'SCRIPT_EOF'\",
    \"$(cat /tmp/bastion_deploy.sh)\",
    \"SCRIPT_EOF\",
    \"chmod +x /tmp/bastion_deploy.sh\",
    \"/tmp/bastion_deploy.sh '$DB_PASSWORD'\"
  ]" \
  --region us-east-1 \
  --output text \
  --query 'Command.CommandId')

echo "✓ Command sent to bastion (ID: $COMMAND_ID)"
echo ""

echo "Step 4: Monitoring execution..."
sleep 5

for i in {1..24}; do
  STATUS=$(aws ssm get-command-invocation \
    --command-id $COMMAND_ID \
    --instance-id $BASTION_ID \
    --region us-east-1 \
    --query 'Status' \
    --output text)

  if [ "$STATUS" == "Success" ]; then
    echo "✓ Deployment successful!"
    echo ""
    echo "Command output:"
    aws ssm get-command-invocation \
      --command-id $COMMAND_ID \
      --instance-id $BASTION_ID \
      --region us-east-1 \
      --query 'StandardOutputContent' \
      --output text
    exit 0
  elif [ "$STATUS" == "Failed" ]; then
    echo "✗ Deployment failed"
    echo ""
    echo "Error output:"
    aws ssm get-command-invocation \
      --command-id $COMMAND_ID \
      --instance-id $BASTION_ID \
      --region us-east-1 \
      --query 'StandardErrorContent' \
      --output text
    exit 1
  else
    echo "Status: $STATUS (waiting...)"
    sleep 5
  fi
done

echo "Timeout waiting for deployment to complete"
exit 1
