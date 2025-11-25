# Prerequisites Setup Guide - Omnirapeutic Phase 1

**Status:** Pre-Deployment Checklist
**Priority:** CRITICAL - Complete before deploying infrastructure
**Estimated Time:** 2-4 hours

---

## Quick Status Check

Run this command to check your current setup:

```bash
# Quick prerequisite checker
echo "=== Prerequisites Status Check ==="
echo ""

# Check AWS CLI
if command -v aws &> /dev/null; then
    echo "✓ AWS CLI installed: $(aws --version)"
else
    echo "✗ AWS CLI not installed"
fi

# Check Terraform
if command -v terraform &> /dev/null; then
    echo "✓ Terraform installed: $(terraform version | head -1)"
else
    echo "✗ Terraform not installed"
fi

# Check Git
if command -v git &> /dev/null; then
    echo "✓ Git installed: $(git --version)"
else
    echo "✗ Git not installed"
fi

# Check AWS credentials
if aws sts get-caller-identity &> /dev/null; then
    echo "✓ AWS credentials configured"
    aws sts get-caller-identity
else
    echo "✗ AWS credentials not configured"
fi
```

---

## Part 1: Tool Installation

### 1.1 Install Terraform

**Linux/Ubuntu:**
```bash
# Add HashiCorp GPG key
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg

# Add HashiCorp repository
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list

# Update and install
sudo apt update && sudo apt install terraform

# Verify installation
terraform version
```

**macOS:**
```bash
# Using Homebrew
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# Verify installation
terraform version
```

**Windows:**
```powershell
# Using Chocolatey
choco install terraform

# Or download from: https://www.terraform.io/downloads
```

**Verify version >= 1.5.0:**
```bash
terraform version
# Expected output: Terraform v1.5.x or higher
```

### 1.2 Install AWS CLI

**Linux:**
```bash
# Download and install
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify installation
aws --version
```

**macOS:**
```bash
# Using Homebrew
brew install awscli

# Or using installer
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

**Windows:**
```powershell
# Download and run installer from:
# https://awscli.amazonaws.com/AWSCLIV2.msi
```

**Verify version >= 2.0:**
```bash
aws --version
# Expected output: aws-cli/2.x.x or higher
```

### 1.3 Install Git

**Linux:**
```bash
sudo apt update
sudo apt install git -y

# Verify
git --version
```

**macOS:**
```bash
brew install git

# Or use Xcode Command Line Tools
xcode-select --install
```

**Windows:**
```powershell
# Download from: https://git-scm.com/download/win
# Or using Chocolatey:
choco install git
```

### 1.4 Configure Git

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@company.com"

# Verify configuration
git config --list
```

---

## Part 2: AWS Account Setup

### 2.1 Configure AWS Credentials

**Option A: Using AWS CLI Configure (Recommended for Development)**

```bash
aws configure

# You'll be prompted for:
# AWS Access Key ID: [Enter your access key]
# AWS Secret Access Key: [Enter your secret key]
# Default region name: us-east-1
# Default output format: json
```

**Option B: Using Environment Variables**

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

**Option C: Using AWS SSO (Recommended for Production)**

```bash
aws configure sso

# Follow prompts to set up SSO
aws sso login --profile omnirapeutic-prod
```

### 2.2 Verify AWS Access

```bash
# Test AWS credentials
aws sts get-caller-identity

# Expected output:
# {
#     "UserId": "AIDXXXXXXXXXXXXXXXXXX",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/your-username"
# }

# Check your permissions
aws iam get-user

# List available regions
aws ec2 describe-regions --query 'Regions[].RegionName' --output table
```

### 2.3 Set Up AWS Organization (Optional but Recommended)

```bash
# Create AWS Organization (if not already exists)
aws organizations create-organization --feature-set ALL

# Create organizational units
aws organizations create-organizational-unit \
  --parent-id r-xxxx \
  --name "Production"

aws organizations create-organizational-unit \
  --parent-id r-xxxx \
  --name "Development"

# Document organization ID for later use
aws organizations describe-organization > aws-organization-info.json
```

---

## Part 3: AWS BAA Setup (CRITICAL FOR HIPAA)

### 3.1 Sign AWS Business Associate Agreement

**Important:** This MUST be completed before deploying any PHI to AWS.

**Steps:**

1. **Log into AWS Console**
   ```
   https://console.aws.amazon.com/
   ```

2. **Navigate to AWS Artifact**
   ```
   Services > Security, Identity & Compliance > AWS Artifact
   ```

3. **Download and Review BAA**
   - Click "Agreements" in left navigation
   - Find "AWS Business Associate Addendum"
   - Click "Download Agreement"

4. **Accept the Agreement**
   - Click "Accept Agreement" button
   - Review terms carefully
   - Click "Accept" to legally bind

5. **Verify Acceptance**
   ```bash
   # Check if BAA is active
   aws artifact get-account-settings --region us-east-1
   ```

6. **Document BAA**
   - Save copy of signed BAA
   - Record date of acceptance
   - Store in legal/compliance folder

### 3.2 Verify HIPAA Eligibility Services

```bash
# List HIPAA eligible services in your region
aws service-quotas list-services --region us-east-1 | grep -i hipaa

# Key services we're using:
# - Amazon RDS (Aurora)
# - Amazon VPC
# - AWS KMS
# - AWS Secrets Manager
# - Amazon S3
# - AWS CloudTrail
```

### 3.3 Create BAA Documentation

```bash
# Create documentation file
cat > AWS_BAA_DOCUMENTATION.md << 'EOF'
# AWS Business Associate Agreement Documentation

**Date Signed:** [Enter date]
**Signed By:** [Your name and title]
**AWS Account ID:** [Your account ID]
**Agreement Version:** [Version from AWS Artifact]

## HIPAA Eligible Services in Use:
- [ ] Amazon RDS Aurora PostgreSQL
- [ ] Amazon VPC
- [ ] AWS KMS
- [ ] AWS Secrets Manager
- [ ] Amazon S3
- [ ] AWS CloudTrail
- [ ] AWS CloudWatch

## Review Schedule:
- Annual review date: [One year from signing]
- Compliance officer: [Name]

## Storage Location:
- Digital copy: [Path to stored PDF]
- Physical copy: [Location if applicable]
EOF

# Edit the file with your information
nano AWS_BAA_DOCUMENTATION.md
```

---

## Part 4: Terraform Remote State Setup

### 4.1 Create S3 Bucket for Terraform State

```bash
# Set variables
export TF_STATE_BUCKET="omnirapeutic-terraform-state-$(aws sts get-caller-identity --query Account --output text)"
export AWS_REGION="us-east-1"

# Create S3 bucket
aws s3api create-bucket \
  --bucket $TF_STATE_BUCKET \
  --region $AWS_REGION

# Enable versioning (CRITICAL for state history)
aws s3api put-bucket-versioning \
  --bucket $TF_STATE_BUCKET \
  --versioning-configuration Status=Enabled

# Enable encryption (CRITICAL for security)
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

# Block public access (CRITICAL for security)
aws s3api put-public-access-block \
  --bucket $TF_STATE_BUCKET \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable logging
aws s3api put-bucket-logging \
  --bucket $TF_STATE_BUCKET \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "'$TF_STATE_BUCKET'",
      "TargetPrefix": "state-access-logs/"
    }
  }'

# Verify bucket configuration
aws s3api get-bucket-versioning --bucket $TF_STATE_BUCKET
aws s3api get-bucket-encryption --bucket $TF_STATE_BUCKET
aws s3api get-public-access-block --bucket $TF_STATE_BUCKET

echo "✓ Terraform state bucket created: $TF_STATE_BUCKET"
```

### 4.2 Create DynamoDB Table for State Locking

```bash
# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $AWS_REGION \
  --tags Key=Project,Value=Omnirapeutic Key=Purpose,Value=TerraformStateLock

# Enable point-in-time recovery
aws dynamodb update-continuous-backups \
  --table-name terraform-state-lock \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# Verify table creation
aws dynamodb describe-table \
  --table-name terraform-state-lock \
  --query 'Table.[TableName,TableStatus]' \
  --output table

echo "✓ DynamoDB state lock table created"
```

### 4.3 Update Terraform Backend Configuration

```bash
# Update main.tf with backend configuration
cat > infrastructure/terraform/backend-config.tf << EOF
terraform {
  backend "s3" {
    bucket         = "$TF_STATE_BUCKET"
    key            = "infrastructure/production/terraform.tfstate"
    region         = "$AWS_REGION"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
EOF

echo "✓ Backend configuration created at infrastructure/terraform/backend-config.tf"
echo ""
echo "Add this to your terraform block in main.tf"
```

---

## Part 5: AWS Budget Setup (Cost Control)

### 5.1 Create Monthly Budget Alert

```bash
# Create budget with email notification
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://<(cat <<EOF
{
  "BudgetName": "omnirapeutic-monthly-budget",
  "BudgetLimit": {
    "Amount": "200",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
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
) \
  --notifications-with-subscribers file://<(cat <<EOF
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
        "Address": "devops@omnirapeutic.com"
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
        "Address": "devops@omnirapeutic.com"
      }
    ]
  }
]
EOF
)

echo "✓ AWS Budget created with email alerts"
```

**Note:** Replace `devops@omnirapeutic.com` with your actual email address.

### 5.2 Enable Cost Anomaly Detection

```bash
# Create cost anomaly monitor
aws ce create-anomaly-monitor \
  --anomaly-monitor '{
    "MonitorName": "omnirapeutic-cost-monitor",
    "MonitorType": "DIMENSIONAL",
    "MonitorDimension": "SERVICE"
  }'

# Get monitor ARN
MONITOR_ARN=$(aws ce get-anomaly-monitors \
  --query 'AnomalyMonitors[?MonitorName==`omnirapeutic-cost-monitor`].MonitorArn' \
  --output text)

# Create subscription for alerts
aws ce create-anomaly-subscription \
  --anomaly-subscription '{
    "SubscriptionName": "omnirapeutic-cost-alerts",
    "Threshold": 100,
    "Frequency": "DAILY",
    "MonitorArnList": ["'$MONITOR_ARN'"],
    "Subscribers": [{
      "Type": "EMAIL",
      "Address": "devops@omnirapeutic.com"
    }]
  }'

echo "✓ Cost anomaly detection enabled"
```

---

## Part 6: GitHub Repository Setup

### 6.1 Create GitHub Repository

```bash
# Create new repository (if not already exists)
gh repo create omnirapeutic/infrastructure \
  --private \
  --description "Omnirapeutic HIPAA-compliant infrastructure" \
  --gitignore Terraform \
  --license MIT

# Or clone existing repository
git clone https://github.com/your-org/omnirapeutic.git
cd omnirapeutic
```

### 6.2 Configure AWS OIDC Provider for GitHub Actions

```bash
# Create OIDC provider for GitHub
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create IAM role for GitHub Actions
cat > github-actions-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/omnirapeutic:*"
        }
      }
    }
  ]
}
EOF

# Replace ACCOUNT_ID and YOUR_ORG
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed -i "s/ACCOUNT_ID/$ACCOUNT_ID/g" github-actions-trust-policy.json
sed -i "s/YOUR_ORG/your-github-org/g" github-actions-trust-policy.json

# Create the IAM role
aws iam create-role \
  --role-name GitHubActionsOmnirapeuticRole \
  --assume-role-policy-document file://github-actions-trust-policy.json

# Attach administrator policy (you can restrict this later)
aws iam attach-role-policy \
  --role-name GitHubActionsOmnirapeuticRole \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name GitHubActionsOmnirapeuticRole --query 'Role.Arn' --output text)

echo "✓ GitHub Actions OIDC configured"
echo "Role ARN: $ROLE_ARN"
echo ""
echo "Add this as a GitHub secret:"
echo "  Name: AWS_ROLE_ARN"
echo "  Value: $ROLE_ARN"
```

### 6.3 Add GitHub Secrets

```bash
# Using GitHub CLI
gh secret set AWS_ROLE_ARN --body "$ROLE_ARN"

# Or add manually in GitHub UI:
# Settings > Secrets and variables > Actions > New repository secret
```

---

## Part 7: Final Verification

### 7.1 Run Complete Prerequisites Check

```bash
# Save this as: infrastructure/scripts/check-prerequisites.sh
cat > infrastructure/scripts/check-prerequisites.sh << 'EOF'
#!/bin/bash

echo "========================================="
echo "Omnirapeutic Prerequisites Check"
echo "========================================="
echo ""

PASSED=0
FAILED=0

# Check tools
echo "1. Checking required tools..."
if command -v terraform &> /dev/null; then
    VERSION=$(terraform version | head -1 | grep -oP '\d+\.\d+\.\d+')
    if [[ "$VERSION" > "1.5.0" || "$VERSION" == "1.5.0" ]]; then
        echo "   ✓ Terraform $VERSION installed"
        ((PASSED++))
    else
        echo "   ✗ Terraform version $VERSION < 1.5.0"
        ((FAILED++))
    fi
else
    echo "   ✗ Terraform not installed"
    ((FAILED++))
fi

if command -v aws &> /dev/null; then
    echo "   ✓ AWS CLI installed: $(aws --version | cut -d' ' -f1)"
    ((PASSED++))
else
    echo "   ✗ AWS CLI not installed"
    ((FAILED++))
fi

if command -v git &> /dev/null; then
    echo "   ✓ Git installed: $(git --version | cut -d' ' -f3)"
    ((PASSED++))
else
    echo "   ✗ Git not installed"
    ((FAILED++))
fi

# Check AWS credentials
echo ""
echo "2. Checking AWS credentials..."
if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    echo "   ✓ AWS credentials configured (Account: $ACCOUNT)"
    ((PASSED++))
else
    echo "   ✗ AWS credentials not configured"
    ((FAILED++))
fi

# Check Terraform state bucket
echo ""
echo "3. Checking Terraform state backend..."
TF_STATE_BUCKET="omnirapeutic-terraform-state-$ACCOUNT"
if aws s3api head-bucket --bucket "$TF_STATE_BUCKET" 2>/dev/null; then
    echo "   ✓ S3 state bucket exists: $TF_STATE_BUCKET"
    ((PASSED++))

    # Check versioning
    VERSIONING=$(aws s3api get-bucket-versioning --bucket "$TF_STATE_BUCKET" --query 'Status' --output text)
    if [ "$VERSIONING" == "Enabled" ]; then
        echo "   ✓ Bucket versioning enabled"
        ((PASSED++))
    else
        echo "   ✗ Bucket versioning not enabled"
        ((FAILED++))
    fi
else
    echo "   ✗ S3 state bucket does not exist"
    ((FAILED++))
fi

# Check DynamoDB lock table
if aws dynamodb describe-table --table-name terraform-state-lock &> /dev/null; then
    echo "   ✓ DynamoDB lock table exists"
    ((PASSED++))
else
    echo "   ✗ DynamoDB lock table does not exist"
    ((FAILED++))
fi

# Check AWS Budget
echo ""
echo "4. Checking cost controls..."
if aws budgets describe-budgets --account-id "$ACCOUNT" --query 'Budgets[?BudgetName==`omnirapeutic-monthly-budget`]' --output text | grep -q .; then
    echo "   ✓ AWS Budget configured"
    ((PASSED++))
else
    echo "   ✗ AWS Budget not configured"
    ((FAILED++))
fi

# Summary
echo ""
echo "========================================="
echo "Results: $PASSED passed, $FAILED failed"
echo "========================================="

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "✓ All prerequisites met! Ready to deploy Phase 1."
    exit 0
else
    echo ""
    echo "✗ Some prerequisites not met. Please complete setup."
    exit 1
fi
EOF

chmod +x infrastructure/scripts/check-prerequisites.sh

# Run the check
./infrastructure/scripts/check-prerequisites.sh
```

### 7.2 Prerequisites Checklist

```
[ ] Terraform >= 1.5.0 installed
[ ] AWS CLI >= 2.0 installed
[ ] Git installed
[ ] AWS credentials configured
[ ] AWS BAA signed and activated
[ ] Terraform S3 state bucket created with:
    [ ] Versioning enabled
    [ ] Encryption enabled
    [ ] Public access blocked
[ ] DynamoDB state lock table created
[ ] AWS Budget configured
[ ] Cost anomaly detection enabled
[ ] GitHub repository created
[ ] GitHub Actions OIDC provider configured
[ ] AWS_ROLE_ARN secret added to GitHub
[ ] Prerequisites check script passing
```

---

## Part 8: Next Steps

Once all prerequisites are complete:

1. **Initialize Terraform**
   ```bash
   cd infrastructure/terraform/environments/production
   terraform init
   ```

2. **Run Setup Script**
   ```bash
   cd ../../../
   ./infrastructure/scripts/setup.sh
   ```

3. **Deploy Phase 1**
   - Follow prompts in setup script
   - Review Terraform plan carefully
   - Approve deployment

---

## Troubleshooting

### AWS CLI not working
```bash
# Check credentials
aws configure list

# Test with simple command
aws s3 ls

# Check region
echo $AWS_DEFAULT_REGION
```

### Terraform backend initialization fails
```bash
# Verify bucket exists
aws s3 ls | grep terraform-state

# Check bucket policy
aws s3api get-bucket-policy --bucket your-bucket-name

# Verify DynamoDB table
aws dynamodb describe-table --table-name terraform-state-lock
```

### OIDC provider issues
```bash
# List OIDC providers
aws iam list-open-id-connect-providers

# Check trust policy
aws iam get-role --role-name GitHubActionsOmnirapeuticRole
```

---

## Support Contacts

- **AWS Support:** https://console.aws.amazon.com/support/
- **Terraform Documentation:** https://www.terraform.io/docs
- **GitHub Actions OIDC:** https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services

---

**Document Version:** 1.0
**Last Updated:** 2025-11-24
**Next Review:** Before Phase 1 deployment
