#!/bin/bash
# Infrastructure Verification Script
# Verifies Phase 1 deployment

set -e

echo "========================================"
echo "Infrastructure Verification - Phase 1"
echo "========================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

read -p "Select environment (dev/staging/production): " ENVIRONMENT

if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo -e "${RED}ERROR: Invalid environment${NC}"
    exit 1
fi

PASSED=0
FAILED=0

# Check VPC
echo "Checking VPC..."
VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=tag:Project,Values=omnirapeutic" "Name=tag:Environment,Values=$ENVIRONMENT" \
    --query 'Vpcs[0].VpcId' \
    --output text 2>/dev/null || echo "")

if [ "$VPC_ID" != "" ] && [ "$VPC_ID" != "None" ]; then
    echo -e "${GREEN}✓ VPC exists: $VPC_ID${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ VPC not found${NC}"
    ((FAILED++))
fi

# Check Aurora encryption
echo "Checking Aurora encryption..."
AURORA_ENCRYPTED=$(aws rds describe-db-clusters \
    --db-cluster-identifier omnirapeutic-$ENVIRONMENT \
    --query 'DBClusters[0].StorageEncrypted' \
    --output text 2>/dev/null || echo "false")

if [ "$AURORA_ENCRYPTED" == "True" ]; then
    echo -e "${GREEN}✓ Aurora encryption enabled${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ Aurora encryption NOT enabled${NC}"
    ((FAILED++))
fi

# Check Aurora backup retention
echo "Checking Aurora backup retention..."
BACKUP_RETENTION=$(aws rds describe-db-clusters \
    --db-cluster-identifier omnirapeutic-$ENVIRONMENT \
    --query 'DBClusters[0].BackupRetentionPeriod' \
    --output text 2>/dev/null || echo "0")

if [ "$BACKUP_RETENTION" -ge 35 ]; then
    echo -e "${GREEN}✓ Backup retention: $BACKUP_RETENTION days (HIPAA compliant)${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ Backup retention: $BACKUP_RETENTION days (should be >= 35)${NC}"
    ((FAILED++))
fi

# Check VPC Flow Logs
echo "Checking VPC Flow Logs..."
FLOW_LOGS=$(aws ec2 describe-flow-logs \
    --filter "Name=resource-id,Values=$VPC_ID" \
    --query 'FlowLogs[0].FlowLogId' \
    --output text 2>/dev/null || echo "")

if [ "$FLOW_LOGS" != "" ] && [ "$FLOW_LOGS" != "None" ]; then
    echo -e "${GREEN}✓ VPC Flow Logs enabled${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ VPC Flow Logs not found${NC}"
    ((FAILED++))
fi

# Check Secrets Manager
echo "Checking Secrets Manager..."
SECRETS_COUNT=$(aws secretsmanager list-secrets \
    --filters Key=tag-key,Values=Name Key=tag-value,Values=omnirapeutic-$ENVIRONMENT \
    --query 'length(SecretList)' \
    --output text 2>/dev/null || echo "0")

if [ "$SECRETS_COUNT" -ge 4 ]; then
    echo -e "${GREEN}✓ Secrets Manager: $SECRETS_COUNT secrets found${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ Secrets Manager: only $SECRETS_COUNT secrets found (expected 4+)${NC}"
    ((FAILED++))
fi

# Check KMS keys
echo "Checking KMS keys..."
KMS_KEYS=$(aws kms list-aliases \
    --query "Aliases[?contains(AliasName, 'omnirapeutic-$ENVIRONMENT')].AliasName" \
    --output text 2>/dev/null || echo "")

KMS_COUNT=$(echo "$KMS_KEYS" | wc -w)
if [ "$KMS_COUNT" -ge 3 ]; then
    echo -e "${GREEN}✓ KMS keys: $KMS_COUNT keys found${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ KMS keys: only $KMS_COUNT keys found (expected 3)${NC}"
    ((FAILED++))
fi

# Check Aurora status
echo "Checking Aurora status..."
AURORA_STATUS=$(aws rds describe-db-clusters \
    --db-cluster-identifier omnirapeutic-$ENVIRONMENT \
    --query 'DBClusters[0].Status' \
    --output text 2>/dev/null || echo "unknown")

if [ "$AURORA_STATUS" == "available" ]; then
    echo -e "${GREEN}✓ Aurora status: available${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ Aurora status: $AURORA_STATUS${NC}"
    ((FAILED++))
fi

# Summary
echo ""
echo "========================================"
echo "Verification Summary"
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo "Phase 1 infrastructure is ready for Phase 2"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo "Please review and fix issues before proceeding to Phase 2"
    exit 1
fi
