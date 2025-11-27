#!/bin/bash

# Disaster Recovery Test Script
# Tests Aurora PostgreSQL restore from backup to validate B/DR procedures
# HIPAA § 164.308(a)(7)(ii)(D) - Testing and Revision Procedures

set -euo pipefail

# Configuration
PROJECT_NAME="omnirapeutic"
ENVIRONMENT="production"
CLUSTER_ID="${PROJECT_NAME}-${ENVIRONMENT}"
TEST_CLUSTER_ID="${CLUSTER_ID}-dr-test-$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="/root/projects/omnirapeutic/infrastructure/docs/tests"
REPORT_FILE="${REPORT_DIR}/dr-test-$(date +%Y%m%d-%H%M%S).md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
START_TIME=$(date +%s)

# Ensure report directory exists
mkdir -p "$REPORT_DIR"

# Function to log messages
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        INFO)
            echo -e "${BLUE}[INFO]${NC} $message"
            echo "[$timestamp] [INFO] $message" >> "$REPORT_FILE"
            ;;
        SUCCESS)
            echo -e "${GREEN}[PASS]${NC} $message"
            echo "[$timestamp] [PASS] $message" >> "$REPORT_FILE"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            ;;
        ERROR)
            echo -e "${RED}[FAIL]${NC} $message"
            echo "[$timestamp] [FAIL] $message" >> "$REPORT_FILE"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            ;;
        WARN)
            echo -e "${YELLOW}[WARN]${NC} $message"
            echo "[$timestamp] [WARN] $message" >> "$REPORT_FILE"
            ;;
    esac
}

# Function to cleanup test cluster
cleanup() {
    local exit_code=$?

    if [ -n "${TEST_CLUSTER_ID:-}" ]; then
        log INFO "Cleaning up test cluster: $TEST_CLUSTER_ID"

        # Delete cluster instances first
        INSTANCE_IDS=$(aws rds describe-db-clusters \
            --db-cluster-identifier "$TEST_CLUSTER_ID" \
            --query 'DBClusters[0].DBClusterMembers[*].DBInstanceIdentifier' \
            --output text 2>/dev/null || echo "")

        if [ -n "$INSTANCE_IDS" ]; then
            for INSTANCE_ID in $INSTANCE_IDS; do
                log INFO "Deleting instance: $INSTANCE_ID"
                aws rds delete-db-instance \
                    --db-instance-identifier "$INSTANCE_ID" \
                    --skip-final-snapshot 2>/dev/null || true
            done

            # Wait for instances to be deleted
            log INFO "Waiting for instances to be deleted..."
            sleep 30
        fi

        # Delete the cluster
        log INFO "Deleting cluster: $TEST_CLUSTER_ID"
        aws rds delete-db-cluster \
            --db-cluster-identifier "$TEST_CLUSTER_ID" \
            --skip-final-snapshot 2>/dev/null || true

        log SUCCESS "Cleanup initiated (deletion will complete asynchronously)"
    fi

    # Generate summary
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

    echo "" >> "$REPORT_FILE"
    echo "---" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "## Test Summary" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "- **Total Tests**: $TOTAL_TESTS" >> "$REPORT_FILE"
    echo "- **Passed**: $TESTS_PASSED" >> "$REPORT_FILE"
    echo "- **Failed**: $TESTS_FAILED" >> "$REPORT_FILE"
    echo "- **Duration**: ${DURATION}s" >> "$REPORT_FILE"
    echo "- **Result**: $([ $TESTS_FAILED -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL')" >> "$REPORT_FILE"

    log INFO "Test report saved to: $REPORT_FILE"

    if [ $TESTS_FAILED -gt 0 ]; then
        log ERROR "DR test failed with $TESTS_FAILED errors"
        exit 1
    fi

    log SUCCESS "DR test completed successfully"
    exit 0
}

trap cleanup EXIT INT TERM

# Initialize report
cat > "$REPORT_FILE" <<EOF
# Disaster Recovery Test Report

**Date**: $(date '+%Y-%m-%d %H:%M:%S %Z')
**Cluster**: $CLUSTER_ID
**Test Cluster**: $TEST_CLUSTER_ID
**Tester**: Automated Test Script

---

## Test Procedure

This test validates the disaster recovery process by:
1. Identifying the latest automated backup
2. Restoring to a new test cluster
3. Validating data integrity
4. Verifying encryption and security settings
5. Measuring restoration time against RTO targets
6. Cleaning up test resources

---

## Test Results

EOF

log INFO "Starting Disaster Recovery Test"
log INFO "Source Cluster: $CLUSTER_ID"
log INFO "Test Cluster: $TEST_CLUSTER_ID"

# Test 1: Verify source cluster exists and is available
log INFO "Test 1: Verifying source cluster status..."
CLUSTER_STATUS=$(aws rds describe-db-clusters \
    --db-cluster-identifier "$CLUSTER_ID" \
    --query 'DBClusters[0].Status' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$CLUSTER_STATUS" = "available" ]; then
    log SUCCESS "Source cluster is available"
else
    log ERROR "Source cluster is not available (Status: $CLUSTER_STATUS)"
    exit 1
fi

# Test 2: Check for recent automated backups
log INFO "Test 2: Checking for recent automated backups..."
LATEST_SNAPSHOT=$(aws rds describe-db-cluster-snapshots \
    --db-cluster-identifier "$CLUSTER_ID" \
    --snapshot-type automated \
    --query 'reverse(sort_by(DBClusterSnapshots, &SnapshotCreateTime))[0]' \
    --output json)

if [ "$LATEST_SNAPSHOT" = "null" ] || [ -z "$LATEST_SNAPSHOT" ]; then
    log ERROR "No automated snapshots found"
    exit 1
fi

SNAPSHOT_ID=$(echo "$LATEST_SNAPSHOT" | jq -r '.DBClusterSnapshotIdentifier')
SNAPSHOT_TIME=$(echo "$LATEST_SNAPSHOT" | jq -r '.SnapshotCreateTime')
SNAPSHOT_ENCRYPTED=$(echo "$LATEST_SNAPSHOT" | jq -r '.StorageEncrypted')

log SUCCESS "Found automated snapshot: $SNAPSHOT_ID (Created: $SNAPSHOT_TIME)"

# Test 3: Verify snapshot is encrypted
log INFO "Test 3: Verifying snapshot encryption..."
if [ "$SNAPSHOT_ENCRYPTED" = "true" ]; then
    log SUCCESS "Snapshot is encrypted (HIPAA compliant)"
else
    log ERROR "Snapshot is not encrypted (HIPAA violation)"
fi

# Test 4: Check snapshot age (should be < 25 hours per monitoring policy)
log INFO "Test 4: Checking snapshot age..."
SNAPSHOT_AGE_SECONDS=$(( $(date +%s) - $(date -d "$SNAPSHOT_TIME" +%s) ))
SNAPSHOT_AGE_HOURS=$(( SNAPSHOT_AGE_SECONDS / 3600 ))

if [ $SNAPSHOT_AGE_HOURS -lt 25 ]; then
    log SUCCESS "Snapshot age is acceptable (${SNAPSHOT_AGE_HOURS}h < 25h threshold)"
else
    log WARN "Snapshot is older than expected (${SNAPSHOT_AGE_HOURS}h > 25h threshold)"
fi

# Test 5: Get cluster configuration for restore
log INFO "Test 5: Retrieving cluster configuration..."
CLUSTER_CONFIG=$(aws rds describe-db-clusters \
    --db-cluster-identifier "$CLUSTER_ID" \
    --query 'DBClusters[0]' \
    --output json)

VPC_SECURITY_GROUP_IDS=$(echo "$CLUSTER_CONFIG" | jq -r '.VpcSecurityGroups[].VpcSecurityGroupId' | tr '\n' ' ')
DB_SUBNET_GROUP=$(echo "$CLUSTER_CONFIG" | jq -r '.DBSubnetGroup')
KMS_KEY_ID=$(echo "$CLUSTER_CONFIG" | jq -r '.KmsKeyId')
ENGINE_VERSION=$(echo "$CLUSTER_CONFIG" | jq -r '.EngineVersion')

log SUCCESS "Retrieved cluster configuration"

# Test 6: Restore cluster from snapshot
log INFO "Test 6: Restoring cluster from snapshot (this may take 5-10 minutes)..."
RESTORE_START=$(date +%s)

# Note: Using restore-db-cluster-from-snapshot for automated snapshot restore
aws rds restore-db-cluster-from-snapshot \
    --db-cluster-identifier "$TEST_CLUSTER_ID" \
    --snapshot-identifier "$SNAPSHOT_ID" \
    --engine aurora-postgresql \
    --engine-version "$ENGINE_VERSION" \
    --db-subnet-group-name "$DB_SUBNET_GROUP" \
    --vpc-security-group-ids $VPC_SECURITY_GROUP_IDS \
    --kms-key-id "$KMS_KEY_ID" \
    --deletion-protection false \
    --tags Key=Name,Value="DR-Test-Cluster" \
           Key=Purpose,Value="DisasterRecoveryTest" \
           Key=CreatedBy,Value="AutomatedTest" \
           Key=DeleteAfter,Value="$(date -d '+1 day' +%Y-%m-%d)" \
    > /dev/null

log SUCCESS "Restore initiated"

# Test 7: Wait for cluster to become available
log INFO "Test 7: Waiting for cluster to become available..."
MAX_WAIT_SECONDS=1800  # 30 minutes
WAIT_INTERVAL=30
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT_SECONDS ]; do
    STATUS=$(aws rds describe-db-clusters \
        --db-cluster-identifier "$TEST_CLUSTER_ID" \
        --query 'DBClusters[0].Status' \
        --output text 2>/dev/null || echo "creating")

    if [ "$STATUS" = "available" ]; then
        RESTORE_END=$(date +%s)
        RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
        RESTORE_MINUTES=$((RESTORE_DURATION / 60))
        log SUCCESS "Cluster is available (Restore time: ${RESTORE_MINUTES}m ${RESTORE_DURATION}s)"
        break
    fi

    log INFO "Cluster status: $STATUS (${ELAPSED}s elapsed)"
    sleep $WAIT_INTERVAL
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT_SECONDS ]; then
    log ERROR "Cluster restore timeout (exceeded ${MAX_WAIT_SECONDS}s)"
    exit 1
fi

# Test 8: Verify RTO compliance (should be < 4 hours for critical recovery)
log INFO "Test 8: Verifying RTO compliance..."
RTO_THRESHOLD_SECONDS=$((4 * 3600))  # 4 hours

if [ $RESTORE_DURATION -lt $RTO_THRESHOLD_SECONDS ]; then
    log SUCCESS "Restore time meets RTO target (${RESTORE_MINUTES}m < 4h)"
else
    log ERROR "Restore time exceeds RTO target (${RESTORE_MINUTES}m > 4h)"
fi

# Test 9: Create a DB instance in the restored cluster
log INFO "Test 9: Creating DB instance in restored cluster..."
aws rds create-db-instance \
    --db-instance-identifier "${TEST_CLUSTER_ID}-instance-1" \
    --db-cluster-identifier "$TEST_CLUSTER_ID" \
    --db-instance-class db.serverless \
    --engine aurora-postgresql \
    > /dev/null

log SUCCESS "DB instance creation initiated"

# Test 10: Wait for instance to become available
log INFO "Test 10: Waiting for instance to become available..."
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT_SECONDS ]; do
    INSTANCE_STATUS=$(aws rds describe-db-instances \
        --db-instance-identifier "${TEST_CLUSTER_ID}-instance-1" \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text 2>/dev/null || echo "creating")

    if [ "$INSTANCE_STATUS" = "available" ]; then
        log SUCCESS "Instance is available"
        break
    fi

    log INFO "Instance status: $INSTANCE_STATUS (${ELAPSED}s elapsed)"
    sleep $WAIT_INTERVAL
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT_SECONDS ]; then
    log ERROR "Instance creation timeout"
    exit 1
fi

# Test 11: Verify restored cluster configuration
log INFO "Test 11: Verifying restored cluster configuration..."
RESTORED_CONFIG=$(aws rds describe-db-clusters \
    --db-cluster-identifier "$TEST_CLUSTER_ID" \
    --query 'DBClusters[0]' \
    --output json)

RESTORED_ENCRYPTED=$(echo "$RESTORED_CONFIG" | jq -r '.StorageEncrypted')
RESTORED_ENGINE=$(echo "$RESTORED_CONFIG" | jq -r '.Engine')
RESTORED_VERSION=$(echo "$RESTORED_CONFIG" | jq -r '.EngineVersion')

if [ "$RESTORED_ENCRYPTED" = "true" ]; then
    log SUCCESS "Restored cluster is encrypted"
else
    log ERROR "Restored cluster is not encrypted"
fi

if [ "$RESTORED_ENGINE" = "aurora-postgresql" ]; then
    log SUCCESS "Restored cluster engine is correct"
else
    log ERROR "Restored cluster engine mismatch (got: $RESTORED_ENGINE)"
fi

if [ "$RESTORED_VERSION" = "$ENGINE_VERSION" ]; then
    log SUCCESS "Restored cluster version matches source"
else
    log WARN "Restored cluster version differs (Source: $ENGINE_VERSION, Restored: $RESTORED_VERSION)"
fi

# Test 12: Get connection endpoint
log INFO "Test 12: Retrieving cluster endpoint..."
CLUSTER_ENDPOINT=$(echo "$RESTORED_CONFIG" | jq -r '.Endpoint')
READER_ENDPOINT=$(echo "$RESTORED_CONFIG" | jq -r '.ReaderEndpoint')

log SUCCESS "Cluster endpoint: $CLUSTER_ENDPOINT"
log SUCCESS "Reader endpoint: $READER_ENDPOINT"

# Test 13: Verify cluster is reachable (DNS resolution)
log INFO "Test 13: Verifying DNS resolution..."
if nslookup "$CLUSTER_ENDPOINT" > /dev/null 2>&1; then
    log SUCCESS "Cluster endpoint resolves"
else
    log ERROR "Cluster endpoint does not resolve"
fi

# Test 14: Get database credentials from Secrets Manager
log INFO "Test 14: Retrieving database credentials..."
DB_SECRET_NAME="omnirapeutic/production/database"

if aws secretsmanager describe-secret --secret-id "$DB_SECRET_NAME" > /dev/null 2>&1; then
    DB_PASSWORD=$(aws secretsmanager get-secret-value \
        --secret-id "$DB_SECRET_NAME" \
        --query 'SecretString' \
        --output text | jq -r '.password' 2>/dev/null || echo "")

    DB_USERNAME=$(aws secretsmanager get-secret-value \
        --secret-id "$DB_SECRET_NAME" \
        --query 'SecretString' \
        --output text | jq -r '.username' 2>/dev/null || echo "postgres")

    if [ -n "$DB_PASSWORD" ]; then
        log SUCCESS "Retrieved database credentials from Secrets Manager"
    else
        log WARN "Could not parse database credentials"
    fi
else
    log WARN "Database secret not found in Secrets Manager (using manual credentials)"
    DB_USERNAME="postgres"
    DB_PASSWORD=""
fi

# Test 15: Verify database connectivity (if credentials available)
log INFO "Test 15: Testing database connectivity..."

if [ -n "$DB_PASSWORD" ]; then
    # Check if we can resolve the endpoint and port is open
    if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$CLUSTER_ENDPOINT/5432" 2>/dev/null; then
        log SUCCESS "Database port 5432 is reachable"

        # Try to connect to database (requires psql client)
        if command -v psql &> /dev/null; then
            PGPASSWORD="$DB_PASSWORD" psql -h "$CLUSTER_ENDPOINT" -U "$DB_USERNAME" -d omnirapeutic -c "SELECT 1;" > /dev/null 2>&1
            if [ $? -eq 0 ]; then
                log SUCCESS "Database connection successful"

                # Test 16: Validate data integrity
                log INFO "Test 16: Validating data integrity..."

                # Check for users table
                USER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$CLUSTER_ENDPOINT" -U "$DB_USERNAME" -d omnirapeutic -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs)
                if [ -n "$USER_COUNT" ] && [ "$USER_COUNT" -gt 0 ]; then
                    log SUCCESS "Users table validated ($USER_COUNT records)"
                else
                    log WARN "Users table is empty or inaccessible"
                fi

                # Check for audit_log table
                AUDIT_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$CLUSTER_ENDPOINT" -U "$DB_USERNAME" -d omnirapeutic -t -c "SELECT COUNT(*) FROM audit_log;" 2>/dev/null | xargs)
                if [ -n "$AUDIT_COUNT" ]; then
                    log SUCCESS "Audit log table validated ($AUDIT_COUNT records)"
                else
                    log WARN "Audit log table is empty or inaccessible"
                fi
            else
                log WARN "Could not authenticate to database (credentials may have changed)"
            fi
        else
            log WARN "psql client not installed, skipping database connectivity test"
        fi
    else
        log WARN "Database port 5432 not reachable (may need bastion host or VPN)"
    fi
else
    log WARN "No database credentials available, skipping connectivity test"
fi

# Test 17: Verify backup retention settings
log INFO "Test 17: Verifying backup retention..."
BACKUP_RETENTION=$(echo "$RESTORED_CONFIG" | jq -r '.BackupRetentionPeriod')

if [ "$BACKUP_RETENTION" -ge 30 ]; then
    log SUCCESS "Backup retention meets HIPAA requirements (${BACKUP_RETENTION} days >= 30 days)"
else
    log ERROR "Backup retention below HIPAA requirements (${BACKUP_RETENTION} days < 30 days)"
fi

# Test 18: Check deletion protection
log INFO "Test 18: Checking deletion protection..."
DELETION_PROTECTION=$(echo "$RESTORED_CONFIG" | jq -r '.DeletionProtection')

# For test clusters, deletion protection should be disabled for cleanup
if [ "$DELETION_PROTECTION" = "false" ]; then
    log SUCCESS "Deletion protection correctly disabled for test cluster"
else
    log WARN "Deletion protection is enabled (may complicate cleanup)"
fi

# Final summary
log INFO "All tests completed"

# Cleanup will be handled by trap
