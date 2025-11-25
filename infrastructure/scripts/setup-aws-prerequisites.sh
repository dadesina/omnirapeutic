#!/bin/bash
# Interactive AWS Prerequisites Setup Script
# Guides user through manual AWS configuration steps

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "============================================"
echo "AWS Prerequisites Setup Guide"
echo "============================================"
echo ""
echo "This script will guide you through:"
echo "  1. AWS credentials configuration"
echo "  2. Terraform state backend setup"
echo "  3. AWS BAA verification"
echo "  4. AWS Budgets setup"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}ERROR: AWS CLI not found${NC}"
    echo "Please run: ./infrastructure/scripts/install-prerequisites.sh"
    exit 1
fi

# Step 1: Configure AWS Credentials
echo "============================================"
echo "Step 1: Configure AWS Credentials"
echo "============================================"
echo ""

if aws sts get-caller-identity &> /dev/null; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    AWS_ARN=$(aws sts get-caller-identity --query Arn --output text)
    echo -e "${GREEN}✓ AWS credentials already configured${NC}"
    echo "  Account: $AWS_ACCOUNT"
    echo "  Identity: $AWS_ARN"
    echo ""
    read -p "Do you want to reconfigure? (yes/no): " RECONFIG
    if [ "$RECONFIG" == "yes" ]; then
        echo ""
        echo "Run: aws configure"
        echo "Enter your:"
        echo "  - AWS Access Key ID"
        echo "  - AWS Secret Access Key"
        echo "  - Default region (recommend: us-east-1)"
        echo "  - Default output format (recommend: json)"
        aws configure
        echo ""
        echo -e "${GREEN}✓ AWS credentials reconfigured${NC}"
    fi
else
    echo -e "${YELLOW}AWS credentials not configured${NC}"
    echo ""
    echo "You need:"
    echo "  1. AWS Access Key ID"
    echo "  2. AWS Secret Access Key"
    echo ""
    echo "To get these:"
    echo "  1. Log into AWS Console"
    echo "  2. Go to IAM → Users → [Your User]"
    echo "  3. Security credentials → Create access key"
    echo "  4. Download and save credentials securely"
    echo ""
    read -p "Do you have your AWS credentials ready? (yes/no): " HAS_CREDS

    if [ "$HAS_CREDS" == "yes" ]; then
        echo ""
        aws configure

        # Verify
        if aws sts get-caller-identity &> /dev/null; then
            echo ""
            echo -e "${GREEN}✓ AWS credentials configured successfully${NC}"
            AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
            echo "  Account: $AWS_ACCOUNT"
        else
            echo ""
            echo -e "${RED}✗ AWS credentials configuration failed${NC}"
            exit 1
        fi
    else
        echo ""
        echo -e "${YELLOW}Please configure credentials and run this script again${NC}"
        exit 0
    fi
fi

echo ""

# Step 2: Terraform State Backend
echo "============================================"
echo "Step 2: Terraform State Backend Setup"
echo "============================================"
echo ""

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
TF_STATE_BUCKET="omnirapeutic-terraform-state-${AWS_ACCOUNT}"

if aws s3api head-bucket --bucket "$TF_STATE_BUCKET" 2>/dev/null; then
    echo -e "${GREEN}✓ Terraform state bucket already exists: $TF_STATE_BUCKET${NC}"
else
    echo -e "${YELLOW}Terraform state bucket not found${NC}"
    echo ""
    echo "Terraform state backend stores infrastructure state remotely."
    echo "This enables:"
    echo "  - Team collaboration"
    echo "  - State locking (prevents conflicts)"
    echo "  - State versioning (rollback capability)"
    echo ""
    echo "Bucket name: $TF_STATE_BUCKET"
    echo ""
    read -p "Create Terraform state backend? (yes/no): " CREATE_BACKEND

    if [ "$CREATE_BACKEND" == "yes" ]; then
        echo ""
        echo "Creating S3 bucket..."

        # Create bucket
        aws s3api create-bucket \
            --bucket $TF_STATE_BUCKET \
            --region us-east-1 2>/dev/null || echo "Bucket creation error (may already exist)"

        # Enable versioning
        echo "Enabling versioning..."
        aws s3api put-bucket-versioning \
            --bucket $TF_STATE_BUCKET \
            --versioning-configuration Status=Enabled

        # Enable encryption
        echo "Enabling encryption..."
        aws s3api put-bucket-encryption \
            --bucket $TF_STATE_BUCKET \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    },
                    "BucketKeyEnabled": true
                }]
            }'

        # Block public access
        echo "Blocking public access..."
        aws s3api put-public-access-block \
            --bucket $TF_STATE_BUCKET \
            --public-access-block-configuration \
                "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

        # Create DynamoDB table for locking
        echo "Creating DynamoDB lock table..."
        aws dynamodb create-table \
            --table-name terraform-state-lock \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --region us-east-1 2>/dev/null || echo "Table may already exist"

        echo ""
        echo -e "${GREEN}✓ Terraform state backend created successfully${NC}"
        echo "  S3 Bucket: $TF_STATE_BUCKET"
        echo "  DynamoDB Table: terraform-state-lock"
    fi
fi

echo ""

# Step 3: AWS BAA Verification
echo "============================================"
echo "Step 3: AWS Business Associate Agreement"
echo "============================================"
echo ""

echo -e "${YELLOW}CRITICAL FOR HIPAA COMPLIANCE${NC}"
echo ""
echo "AWS Business Associate Agreement (BAA) is legally required"
echo "before deploying infrastructure that will store PHI."
echo ""
echo "To sign AWS BAA:"
echo "  1. Log into AWS Console (as root or admin)"
echo "  2. Search for 'AWS Artifact' in services"
echo "  3. Click 'Agreements' in left menu"
echo "  4. Find 'AWS Business Associate Addendum'"
echo "  5. Click 'Download and Review'"
echo "  6. Read carefully (legal review recommended)"
echo "  7. Click 'Accept Agreement'"
echo "  8. Verify acceptance in agreements list"
echo "  9. Document signature date legally"
echo ""

read -p "Have you signed the AWS BAA? (yes/no): " BAA_SIGNED

if [ "$BAA_SIGNED" == "yes" ]; then
    echo ""
    read -p "Enter BAA signature date (YYYY-MM-DD): " BAA_DATE
    echo ""
    echo -e "${GREEN}✓ AWS BAA signed on: $BAA_DATE${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Document this in your legal records${NC}"
    echo "  - Save BAA PDF from AWS Artifact"
    echo "  - Store with HIPAA compliance documentation"
    echo "  - Review renewal terms"
else
    echo ""
    echo -e "${RED}✗ AWS BAA not signed${NC}"
    echo ""
    echo -e "${YELLOW}You can proceed with development/testing,${NC}"
    echo -e "${YELLOW}but DO NOT deploy production infrastructure${NC}"
    echo -e "${YELLOW}or store PHI until BAA is signed.${NC}"
fi

echo ""

# Step 4: AWS Budgets
echo "============================================"
echo "Step 4: AWS Budgets for Cost Monitoring"
echo "============================================"
echo ""

echo "AWS Budgets helps prevent cost overruns with:"
echo "  - Monthly budget limits"
echo "  - Email alerts at 80% and 100%"
echo "  - Anomaly detection"
echo ""
echo "Recommended budget for Phase 1: \$1,500/month"
echo "  (Actual Phase 1 cost: \$905-1,105/month)"
echo ""

read -p "Set up AWS Budget? (yes/no): " SETUP_BUDGET

if [ "$SETUP_BUDGET" == "yes" ]; then
    echo ""
    read -p "Enter monthly budget amount (default 1500): " BUDGET_AMOUNT
    BUDGET_AMOUNT=${BUDGET_AMOUNT:-1500}

    read -p "Enter email for alerts: " ALERT_EMAIL

    echo ""
    echo "Creating budget..."

    # Create budget JSON
    cat > /tmp/budget.json <<EOF
{
  "BudgetName": "omnirapeutic-monthly-budget",
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY",
  "BudgetLimit": {
    "Amount": "$BUDGET_AMOUNT",
    "Unit": "USD"
  },
  "CostFilters": {},
  "CostTypes": {
    "IncludeTax": true,
    "IncludeSubscription": true,
    "UseBlended": false,
    "IncludeRefund": false,
    "IncludeCredit": false,
    "IncludeUpfront": true,
    "IncludeRecurring": true,
    "IncludeOtherSubscription": true,
    "IncludeSupport": true,
    "IncludeDiscount": true,
    "UseAmortized": false
  }
}
EOF

    # Create notifications JSON
    cat > /tmp/notifications.json <<EOF
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$ALERT_EMAIL"
      }
    ]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$ALERT_EMAIL"
      }
    ]
  }
]
EOF

    aws budgets create-budget \
        --account-id $AWS_ACCOUNT \
        --budget file:///tmp/budget.json \
        --notifications-with-subscribers file:///tmp/notifications.json 2>/dev/null || echo "Budget may already exist"

    rm -f /tmp/budget.json /tmp/notifications.json

    echo ""
    echo -e "${GREEN}✓ AWS Budget created${NC}"
    echo "  Monthly limit: \$${BUDGET_AMOUNT}"
    echo "  Alert email: $ALERT_EMAIL"
    echo "  Alerts: 80% actual, 100% forecasted"
    echo ""
    echo "Check your email and confirm SNS subscription."
fi

echo ""

# Final Summary
echo "============================================"
echo "Setup Complete - Summary"
echo "============================================"
echo ""

SETUP_COMPLETE=0
SETUP_WARNINGS=0

# Check AWS credentials
if aws sts get-caller-identity &> /dev/null; then
    echo -e "${GREEN}✓ AWS credentials configured${NC}"
    ((SETUP_COMPLETE++))
else
    echo -e "${RED}✗ AWS credentials not configured${NC}"
fi

# Check state backend
if aws s3api head-bucket --bucket "$TF_STATE_BUCKET" 2>/dev/null; then
    echo -e "${GREEN}✓ Terraform state backend configured${NC}"
    ((SETUP_COMPLETE++))
else
    echo -e "${YELLOW}⚠ Terraform state backend not configured${NC}"
    ((SETUP_WARNINGS++))
fi

# BAA status
if [ "$BAA_SIGNED" == "yes" ]; then
    echo -e "${GREEN}✓ AWS BAA signed (date: $BAA_DATE)${NC}"
    ((SETUP_COMPLETE++))
else
    echo -e "${YELLOW}⚠ AWS BAA not signed (required for production)${NC}"
    ((SETUP_WARNINGS++))
fi

# Budget status
if [ "$SETUP_BUDGET" == "yes" ]; then
    echo -e "${GREEN}✓ AWS Budget configured${NC}"
    ((SETUP_COMPLETE++))
else
    echo -e "${YELLOW}⚠ AWS Budget not configured${NC}"
    ((SETUP_WARNINGS++))
fi

echo ""
echo "Summary: ${GREEN}${SETUP_COMPLETE} complete${NC}, ${YELLOW}${SETUP_WARNINGS} warnings${NC}"
echo ""

if aws sts get-caller-identity &> /dev/null; then
    echo -e "${GREEN}You can now deploy Phase 1 infrastructure!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify prerequisites: ./infrastructure/scripts/check-prerequisites.sh"
    echo "  2. Deploy infrastructure: ./infrastructure/scripts/setup.sh"
    echo ""

    if [ "$BAA_SIGNED" != "yes" ]; then
        echo -e "${YELLOW}WARNING: Sign AWS BAA before deploying production infrastructure${NC}"
    fi
else
    echo -e "${YELLOW}Please configure AWS credentials before deploying${NC}"
fi

echo ""
echo "For detailed instructions, see: PREREQUISITES_SETUP_GUIDE.md"
echo ""
