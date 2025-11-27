#!/bin/bash

# Publish Backup Metrics to CloudWatch
# Monitors Aurora PostgreSQL backup age and publishes custom metrics
# Used by CloudWatch alarms for B/DR compliance monitoring

set -euo pipefail

# Configuration
PROJECT_NAME="omnirapeutic"
ENVIRONMENT="production"
CLUSTER_ID="${PROJECT_NAME}-${ENVIRONMENT}"
NAMESPACE="Custom/RDS"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        INFO)
            echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        SUCCESS)
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        ERROR)
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        WARN)
            echo -e "${YELLOW}[WARN]${NC} $message"
            ;;
    esac
}

log INFO "Starting backup metrics collection for cluster: $CLUSTER_ID"

# Get the latest automated snapshot
LATEST_SNAPSHOT=$(aws rds describe-db-cluster-snapshots \
    --db-cluster-identifier "$CLUSTER_ID" \
    --snapshot-type automated \
    --region "$REGION" \
    --query 'reverse(sort_by(DBClusterSnapshots, &SnapshotCreateTime))[0]' \
    --output json 2>/dev/null)

if [ "$LATEST_SNAPSHOT" = "null" ] || [ -z "$LATEST_SNAPSHOT" ]; then
    log ERROR "No automated snapshots found for cluster: $CLUSTER_ID"

    # Publish a critical metric value to trigger alarm
    aws cloudwatch put-metric-data \
        --namespace "$NAMESPACE" \
        --metric-name "BackupSnapshotAge" \
        --value 999999 \
        --unit Seconds \
        --region "$REGION" \
        --dimensions DBClusterIdentifier="$CLUSTER_ID"

    log WARN "Published critical metric value (999999s) to trigger alarm"
    exit 1
fi

# Extract snapshot details
SNAPSHOT_ID=$(echo "$LATEST_SNAPSHOT" | jq -r '.DBClusterSnapshotIdentifier')
SNAPSHOT_TIME=$(echo "$LATEST_SNAPSHOT" | jq -r '.SnapshotCreateTime')
SNAPSHOT_STATUS=$(echo "$LATEST_SNAPSHOT" | jq -r '.Status')
SNAPSHOT_ENCRYPTED=$(echo "$LATEST_SNAPSHOT" | jq -r '.StorageEncrypted')
SNAPSHOT_SIZE_GB=$(echo "$LATEST_SNAPSHOT" | jq -r '.AllocatedStorage // 0')

log INFO "Latest snapshot: $SNAPSHOT_ID"
log INFO "Created: $SNAPSHOT_TIME"
log INFO "Status: $SNAPSHOT_STATUS"
log INFO "Encrypted: $SNAPSHOT_ENCRYPTED"
log INFO "Size: ${SNAPSHOT_SIZE_GB}GB"

# Calculate snapshot age in seconds
SNAPSHOT_TIMESTAMP=$(date -d "$SNAPSHOT_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${SNAPSHOT_TIME%.*}" +%s 2>/dev/null)
CURRENT_TIMESTAMP=$(date +%s)
SNAPSHOT_AGE_SECONDS=$((CURRENT_TIMESTAMP - SNAPSHOT_TIMESTAMP))
SNAPSHOT_AGE_HOURS=$((SNAPSHOT_AGE_SECONDS / 3600))
SNAPSHOT_AGE_MINUTES=$(((SNAPSHOT_AGE_SECONDS % 3600) / 60))

log INFO "Snapshot age: ${SNAPSHOT_AGE_HOURS}h ${SNAPSHOT_AGE_MINUTES}m (${SNAPSHOT_AGE_SECONDS}s)"

# Publish snapshot age metric
aws cloudwatch put-metric-data \
    --namespace "$NAMESPACE" \
    --metric-name "BackupSnapshotAge" \
    --value "$SNAPSHOT_AGE_SECONDS" \
    --unit Seconds \
    --region "$REGION" \
    --dimensions DBClusterIdentifier="$CLUSTER_ID"

log SUCCESS "Published BackupSnapshotAge metric: ${SNAPSHOT_AGE_SECONDS}s"

# Publish snapshot size metric
aws cloudwatch put-metric-data \
    --namespace "$NAMESPACE" \
    --metric-name "BackupSnapshotSizeGB" \
    --value "$SNAPSHOT_SIZE_GB" \
    --unit Gigabytes \
    --region "$REGION" \
    --dimensions DBClusterIdentifier="$CLUSTER_ID"

log SUCCESS "Published BackupSnapshotSizeGB metric: ${SNAPSHOT_SIZE_GB}GB"

# Check if snapshot is older than threshold (25 hours = 90000 seconds)
SNAPSHOT_AGE_THRESHOLD=90000  # 25 hours

if [ "$SNAPSHOT_AGE_SECONDS" -gt "$SNAPSHOT_AGE_THRESHOLD" ]; then
    log ERROR "Snapshot age (${SNAPSHOT_AGE_HOURS}h) exceeds threshold (25h) - B/DR compliance risk!"

    # Publish alarm state metric
    aws cloudwatch put-metric-data \
        --namespace "$NAMESPACE" \
        --metric-name "BackupComplianceStatus" \
        --value 0 \
        --unit None \
        --region "$REGION" \
        --dimensions DBClusterIdentifier="$CLUSTER_ID"

    exit 1
else
    log SUCCESS "Snapshot age is within acceptable threshold (${SNAPSHOT_AGE_HOURS}h < 25h)"

    # Publish healthy state metric
    aws cloudwatch put-metric-data \
        --namespace "$NAMESPACE" \
        --metric-name "BackupComplianceStatus" \
        --value 1 \
        --unit None \
        --region "$REGION" \
        --dimensions DBClusterIdentifier="$CLUSTER_ID"
fi

# Get cluster information for additional metrics
CLUSTER_INFO=$(aws rds describe-db-clusters \
    --db-cluster-identifier "$CLUSTER_ID" \
    --region "$REGION" \
    --query 'DBClusters[0]' \
    --output json 2>/dev/null)

if [ -n "$CLUSTER_INFO" ] && [ "$CLUSTER_INFO" != "null" ]; then
    # Extract backup retention period
    BACKUP_RETENTION=$(echo "$CLUSTER_INFO" | jq -r '.BackupRetentionPeriod')

    # Publish backup retention metric
    aws cloudwatch put-metric-data \
        --namespace "$NAMESPACE" \
        --metric-name "BackupRetentionDays" \
        --value "$BACKUP_RETENTION" \
        --unit Count \
        --region "$REGION" \
        --dimensions DBClusterIdentifier="$CLUSTER_ID"

    log SUCCESS "Published BackupRetentionDays metric: ${BACKUP_RETENTION} days"

    # Check HIPAA compliance (minimum 30 days)
    if [ "$BACKUP_RETENTION" -lt 30 ]; then
        log ERROR "Backup retention (${BACKUP_RETENTION} days) below HIPAA minimum (30 days)"

        aws cloudwatch put-metric-data \
            --namespace "$NAMESPACE" \
            --metric-name "HIPAABackupCompliance" \
            --value 0 \
            --unit None \
            --region "$REGION" \
            --dimensions DBClusterIdentifier="$CLUSTER_ID"
    else
        log SUCCESS "Backup retention meets HIPAA requirements (${BACKUP_RETENTION} days >= 30 days)"

        aws cloudwatch put-metric-data \
            --namespace "$NAMESPACE" \
            --metric-name "HIPAABackupCompliance" \
            --value 1 \
            --unit None \
            --region "$REGION" \
            --dimensions DBClusterIdentifier="$CLUSTER_ID"
    fi

    # Extract latest restorable time (for PITR gap monitoring)
    LATEST_RESTORABLE=$(echo "$CLUSTER_INFO" | jq -r '.LatestRestorableTime')

    if [ -n "$LATEST_RESTORABLE" ] && [ "$LATEST_RESTORABLE" != "null" ]; then
        LATEST_RESTORABLE_TIMESTAMP=$(date -d "$LATEST_RESTORABLE" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${LATEST_RESTORABLE%.*}" +%s 2>/dev/null)
        PITR_GAP_SECONDS=$((CURRENT_TIMESTAMP - LATEST_RESTORABLE_TIMESTAMP))
        PITR_GAP_MINUTES=$((PITR_GAP_SECONDS / 60))

        log INFO "PITR gap: ${PITR_GAP_MINUTES} minutes (${PITR_GAP_SECONDS}s)"

        # Publish PITR gap metric
        aws cloudwatch put-metric-data \
            --namespace "$NAMESPACE" \
            --metric-name "PITRGapSeconds" \
            --value "$PITR_GAP_SECONDS" \
            --unit Seconds \
            --region "$REGION" \
            --dimensions DBClusterIdentifier="$CLUSTER_ID"

        log SUCCESS "Published PITRGapSeconds metric: ${PITR_GAP_SECONDS}s"

        # Alert if PITR gap exceeds 10 minutes (target: 5 minutes RPO)
        if [ "$PITR_GAP_MINUTES" -gt 10 ]; then
            log WARN "PITR gap (${PITR_GAP_MINUTES}min) exceeds threshold (10min) - RPO at risk!"
        fi
    fi
fi

# Get count of all automated snapshots
SNAPSHOT_COUNT=$(aws rds describe-db-cluster-snapshots \
    --db-cluster-identifier "$CLUSTER_ID" \
    --snapshot-type automated \
    --region "$REGION" \
    --query 'length(DBClusterSnapshots)' \
    --output text 2>/dev/null || echo "0")

log INFO "Total automated snapshots: $SNAPSHOT_COUNT"

# Publish snapshot count metric
aws cloudwatch put-metric-data \
    --namespace "$NAMESPACE" \
    --metric-name "AutomatedSnapshotCount" \
    --value "$SNAPSHOT_COUNT" \
    --unit Count \
    --region "$REGION" \
    --dimensions DBClusterIdentifier="$CLUSTER_ID"

log SUCCESS "Published AutomatedSnapshotCount metric: $SNAPSHOT_COUNT"

# Calculate expected number of snapshots based on retention period (1 per day)
if [ -n "${BACKUP_RETENTION:-}" ]; then
    if [ "$SNAPSHOT_COUNT" -lt "$BACKUP_RETENTION" ]; then
        log WARN "Snapshot count ($SNAPSHOT_COUNT) below retention period ($BACKUP_RETENTION days)"
    fi
fi

log SUCCESS "Backup metrics collection completed successfully"
