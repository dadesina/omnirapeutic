#!/bin/bash
# Automated Prerequisites Installation Script
# Installs Terraform, AWS CLI for Omnirapeutic deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "Omnirapeutic Prerequisites Installation"
echo "============================================"
echo ""

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    echo "Detected OS: Linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    echo "Detected OS: macOS"
else
    echo -e "${RED}Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. This script will install tools system-wide.${NC}"
    echo ""
fi

# 1. Install AWS CLI
echo "============================================"
echo "1. Installing AWS CLI"
echo "============================================"

if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version)
    echo -e "${GREEN}✓ AWS CLI already installed: $AWS_VERSION${NC}"
else
    echo "Installing AWS CLI..."

    if [ "$OS" == "linux" ]; then
        cd /tmp
        curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
        unzip -q awscliv2.zip
        sudo ./aws/install
        rm -rf aws awscliv2.zip
        echo -e "${GREEN}✓ AWS CLI installed${NC}"
    elif [ "$OS" == "macos" ]; then
        if command -v brew &> /dev/null; then
            brew install awscli
            echo -e "${GREEN}✓ AWS CLI installed via Homebrew${NC}"
        else
            echo -e "${YELLOW}Homebrew not found. Installing AWS CLI manually...${NC}"
            cd /tmp
            curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
            sudo installer -pkg AWSCLIV2.pkg -target /
            rm AWSCLIV2.pkg
            echo -e "${GREEN}✓ AWS CLI installed${NC}"
        fi
    fi
fi

echo ""

# 2. Install Terraform
echo "============================================"
echo "2. Installing Terraform"
echo "============================================"

if command -v terraform &> /dev/null; then
    TF_VERSION=$(terraform version | head -n1)
    echo -e "${GREEN}✓ Terraform already installed: $TF_VERSION${NC}"
else
    echo "Installing Terraform..."

    TERRAFORM_VERSION="1.6.6"

    if [ "$OS" == "linux" ]; then
        cd /tmp
        wget "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
        unzip -q "terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
        sudo mv terraform /usr/local/bin/
        rm "terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
        echo -e "${GREEN}✓ Terraform ${TERRAFORM_VERSION} installed${NC}"
    elif [ "$OS" == "macos" ]; then
        if command -v brew &> /dev/null; then
            brew tap hashicorp/tap
            brew install hashicorp/tap/terraform
            echo -e "${GREEN}✓ Terraform installed via Homebrew${NC}"
        else
            cd /tmp
            wget "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_darwin_amd64.zip"
            unzip -q "terraform_${TERRAFORM_VERSION}_darwin_amd64.zip"
            sudo mv terraform /usr/local/bin/
            rm "terraform_${TERRAFORM_VERSION}_darwin_amd64.zip"
            echo -e "${GREEN}✓ Terraform ${TERRAFORM_VERSION} installed${NC}"
        fi
    fi
fi

echo ""

# 3. Verify Git
echo "============================================"
echo "3. Verifying Git"
echo "============================================"

if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo -e "${GREEN}✓ Git installed: $GIT_VERSION${NC}"
else
    echo -e "${RED}✗ Git not found${NC}"
    echo "Please install Git:"
    if [ "$OS" == "linux" ]; then
        echo "  sudo apt-get install git    (Debian/Ubuntu)"
        echo "  sudo yum install git        (RHEL/CentOS)"
    elif [ "$OS" == "macos" ]; then
        echo "  brew install git"
    fi
    exit 1
fi

echo ""

# 4. Verification Summary
echo "============================================"
echo "Installation Complete - Verification"
echo "============================================"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0

# Verify AWS CLI
if command -v aws &> /dev/null; then
    echo -e "${GREEN}✓ AWS CLI: $(aws --version 2>&1 | cut -d' ' -f1)${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}✗ AWS CLI not found${NC}"
    ((CHECKS_FAILED++))
fi

# Verify Terraform
if command -v terraform &> /dev/null; then
    TF_VER=$(terraform version -json 2>/dev/null | grep -o '"terraform_version":"[^"]*' | cut -d'"' -f4)
    if [ -z "$TF_VER" ]; then
        TF_VER=$(terraform version | head -n1 | cut -d'v' -f2)
    fi
    echo -e "${GREEN}✓ Terraform: v${TF_VER}${NC}"

    # Check version requirement
    REQUIRED_VERSION="1.5.0"
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$TF_VER" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
        echo -e "${GREEN}  Version requirement met (>= ${REQUIRED_VERSION})${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}  Warning: Version ${TF_VER} is below required ${REQUIRED_VERSION}${NC}"
        ((CHECKS_FAILED++))
    fi
else
    echo -e "${RED}✗ Terraform not found${NC}"
    ((CHECKS_FAILED++))
fi

# Verify Git
if command -v git &> /dev/null; then
    echo -e "${GREEN}✓ Git: $(git --version | cut -d' ' -f3)${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}✗ Git not found${NC}"
    ((CHECKS_FAILED++))
fi

echo ""
echo "Summary: ${GREEN}${CHECKS_PASSED} passed${NC}, ${RED}${CHECKS_FAILED} failed${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All prerequisites installed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure AWS credentials: aws configure"
    echo "  2. Sign AWS BAA in AWS Artifact console"
    echo "  3. Run setup script: ./infrastructure/scripts/setup.sh"
    exit 0
else
    echo -e "${RED}✗ Some installations failed${NC}"
    echo "Please review errors above and retry"
    exit 1
fi
