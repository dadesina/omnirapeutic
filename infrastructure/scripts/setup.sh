#!/bin/bash
# Omnirapeutic Infrastructure Setup Script
# Phase 1: Foundation Setup

set -e

echo "============================================"
echo "Omnirapeutic Infrastructure Setup - Phase 1"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}ERROR: Terraform is not installed${NC}"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo -e "${RED}ERROR: AWS CLI is not installed${NC}"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}ERROR: AWS credentials not configured${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Prompt for environment
read -p "Select environment (dev/staging/production): " ENVIRONMENT

if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo -e "${RED}ERROR: Invalid environment${NC}"
    exit 1
fi

echo ""
echo "Selected environment: $ENVIRONMENT"
echo ""

# Prompt for AWS BAA confirmation
if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "${YELLOW}IMPORTANT: HIPAA Compliance${NC}"
    echo "Before deploying production infrastructure with PHI, ensure:"
    echo "  1. AWS Business Associate Agreement (BAA) is signed"
    echo "  2. Legal team has reviewed compliance requirements"
    echo "  3. You have proper authorization to deploy"
    echo ""
    read -p "Has the AWS BAA been signed? (yes/no): " BAA_SIGNED

    if [ "$BAA_SIGNED" != "yes" ]; then
        echo -e "${RED}Cannot proceed without AWS BAA${NC}"
        echo "Please contact legal team to execute AWS BAA first"
        exit 1
    fi
fi

# Change to environment directory
cd "$(dirname "$0")/../terraform/environments/$ENVIRONMENT"

echo ""
echo "Initializing Terraform..."
terraform init

echo ""
echo "Validating Terraform configuration..."
terraform validate

echo ""
echo "Creating Terraform plan..."
terraform plan -out=tfplan

echo ""
echo -e "${YELLOW}Review the plan above carefully${NC}"
read -p "Do you want to apply this plan? (yes/no): " APPLY_CONFIRM

if [ "$APPLY_CONFIRM" == "yes" ]; then
    echo ""
    echo "Applying Terraform configuration..."
    terraform apply tfplan

    echo ""
    echo -e "${GREEN}✓ Infrastructure deployment complete!${NC}"
    echo ""
    echo "Outputs:"
    terraform output

    # Save outputs to file
    terraform output -json > ../../../terraform-outputs-$ENVIRONMENT.json
    echo ""
    echo "Outputs saved to: infrastructure/terraform-outputs-$ENVIRONMENT.json"
else
    echo ""
    echo "Deployment cancelled"
    rm -f tfplan
    exit 0
fi

# Verification
echo ""
echo "Running verification checks..."

VPC_ID=$(terraform output -raw vpc_id 2>/dev/null || echo "")
AURORA_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint 2>/dev/null || echo "")

if [ -n "$VPC_ID" ]; then
    echo -e "${GREEN}✓ VPC created: $VPC_ID${NC}"
else
    echo -e "${RED}✗ VPC not found${NC}"
fi

if [ -n "$AURORA_ENDPOINT" ]; then
    echo -e "${GREEN}✓ Aurora cluster created${NC}"

    # Check if Aurora is available
    CLUSTER_STATUS=$(aws rds describe-db-clusters \
        --db-cluster-identifier omnirapeutic-$ENVIRONMENT \
        --query 'DBClusters[0].Status' \
        --output text 2>/dev/null || echo "unknown")

    if [ "$CLUSTER_STATUS" == "available" ]; then
        echo -e "${GREEN}✓ Aurora cluster status: available${NC}"
    else
        echo -e "${YELLOW}⚠ Aurora cluster status: $CLUSTER_STATUS (may take a few minutes)${NC}"
    fi
else
    echo -e "${RED}✗ Aurora cluster not found${NC}"
fi

echo ""
echo "============================================"
echo "Phase 1 Deployment Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Verify AWS BAA is signed and on file"
echo "  2. Document Aurora endpoint for Phase 2"
echo "  3. Set up bastion host or VPN for database access"
echo "  4. Install pgAudit extension on Aurora"
echo "  5. Proceed with Phase 2: Supabase Self-Hosting"
echo ""
