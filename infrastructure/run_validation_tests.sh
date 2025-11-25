#!/bin/bash
set -e

echo "=== Running Validation Tests on Aurora ==="
echo "Date: $(date)"
echo ""

# Get Aurora endpoint
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier omnirapeutic-production \
  --query 'DBClusters[0].Endpoint' \
  --output text)

# Get database password
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id omnirapeutic/production/aurora/master-password \
  --query 'SecretString' \
  --output text)

echo "Aurora Endpoint: $AURORA_ENDPOINT"
echo ""

# Get bastion instance ID
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=omnirapeutic-production-bastion" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

echo "Bastion Instance: $BASTION_ID"
echo ""

# Get S3 bucket
S3_BUCKET=$(aws cloudtrail describe-trails \
  --query 'trailList[0].S3BucketName' \
  --output text)

# Upload test files to S3
echo "Uploading test files to S3..."
aws s3 cp tests/test_rls_isolation.sql s3://$S3_BUCKET/tests/
aws s3 cp tests/test_authorization_atomic.sql s3://$S3_BUCKET/tests/
aws s3 cp tests/test_audit_logging.sql s3://$S3_BUCKET/tests/

# Create test runner script
cat > /tmp/run_tests.sh << 'TEST_RUNNER'
#!/bin/bash
set -e

echo "=== Downloading Test Files from S3 ==="
mkdir -p /tmp/tests
aws s3 cp s3://S3_BUCKET_PLACEHOLDER/tests/ /tmp/tests/ --recursive

export PGPASSWORD='DB_PASSWORD_PLACEHOLDER'
export AURORA_ENDPOINT='AURORA_ENDPOINT_PLACEHOLDER'

echo ""
echo "=== Test 1: RLS Isolation ==="
echo ""
psql "host=$AURORA_ENDPOINT port=5432 dbname=omnirapeutic user=postgres sslmode=require" \
  -f /tmp/tests/test_rls_isolation.sql 2>&1 | tee /tmp/test_rls_output.txt

echo ""
echo "=== Test 2: Atomic Authorization ==="
echo ""
psql "host=$AURORA_ENDPOINT port=5432 dbname=omnirapeutic user=postgres sslmode=require" \
  -f /tmp/tests/test_authorization_atomic.sql 2>&1 | tee /tmp/test_auth_output.txt

echo ""
echo "=== Test 3: Audit Logging ==="
echo ""
psql "host=$AURORA_ENDPOINT port=5432 dbname=omnirapeutic user=postgres sslmode=require" \
  -f /tmp/tests/test_audit_logging.sql 2>&1 | tee /tmp/test_audit_output.txt

echo ""
echo "=== All Validation Tests Complete ==="
echo ""
echo "Summary:"
grep -E "(PASS|FAIL|Test [0-9]+:)" /tmp/test_*.txt || echo "Tests completed"
TEST_RUNNER

# Replace placeholders
sed -i "s|S3_BUCKET_PLACEHOLDER|$S3_BUCKET|g" /tmp/run_tests.sh
sed -i "s|DB_PASSWORD_PLACEHOLDER|$DB_PASSWORD|g" /tmp/run_tests.sh
sed -i "s|AURORA_ENDPOINT_PLACEHOLDER|$AURORA_ENDPOINT|g" /tmp/run_tests.sh

# Upload test runner to S3
aws s3 cp /tmp/run_tests.sh s3://$S3_BUCKET/scripts/

# Execute tests on bastion
echo "Executing validation tests on bastion..."
echo ""

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$BASTION_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    'aws s3 cp s3://$S3_BUCKET/scripts/run_tests.sh /tmp/',
    'chmod +x /tmp/run_tests.sh',
    '/tmp/run_tests.sh'
  ]" \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
echo ""
echo "Waiting for tests to complete..."
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
    echo "=== Test Execution Complete ==="
    echo ""
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$BASTION_ID" \
      --query 'StandardOutputContent' \
      --output text
    exit 0
  elif [ "$STATUS" == "Failed" ]; then
    echo ""
    echo "=== Test Execution Failed ==="
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

echo "Timeout waiting for tests to complete"
exit 1
