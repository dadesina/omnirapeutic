# CI/CD Pipeline Documentation

## Overview

Automated CI/CD pipelines for the Omnirapeutic platform using GitHub Actions.

## Architecture

```
Pull Request → Run Tests → Merge to main → Build Docker Image → Push to ECR → Deploy to Staging
```

## Workflows

### 1. Terraform CI/CD (`terraform-plan.yml`, `terraform-apply.yml`)
- **Purpose**: Infrastructure as Code automation
- **Trigger**: Changes to `infrastructure/terraform/**`
- **Process**:
  - PR: Runs `terraform plan` and posts results
  - Main: Runs `terraform apply` with manual approval

### 2. API CI/CD (`api-ci.yml`)
- **Purpose**: API application deployment
- **Trigger**: Changes to `api/**`
- **Process**:
  - Lint and test code
  - Build Docker image
  - Scan for vulnerabilities
  - Push to ECR
  - Deploy to staging automatically

### 3. Web CI/CD (`web-ci.yml`)
- **Purpose**: Web frontend deployment
- **Trigger**: Changes to `web/**`
- **Process**:
  - Lint and test code
  - Build Docker image with build-time env vars
  - Scan for vulnerabilities
  - Push to ECR with multiple tags
  - Update ECS task definition
  - Deploy to staging automatically
  - Health check verification

## Backend Configuration

### Terraform State
- **Storage**: S3 bucket `omnirapeutic-terraform-state`
- **Locking**: DynamoDB table `omnirapeutic-terraform-locks`
- **Encryption**: AES-256
- **Versioning**: Enabled

### State Location
```
s3://omnirapeutic-terraform-state/production/terraform.tfstate
```

## Authentication

All workflows use OIDC authentication with AWS:
- **Role**: `GitHubActionsOmnirapeuticRole`
- **Permissions**: ECR, ECS, S3, DynamoDB, Terraform operations

## Environment Variables

### API Service
- Standard Node.js/Express environment variables
- Database connection via AWS Secrets Manager

### Web Service
- **Build-time**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`
- **Runtime**: `HOSTNAME=0.0.0.0`, `NODE_ENV=production`

## Deployment Flow

### Staging
1. Code pushed to `main` branch
2. Workflow triggered automatically
3. Tests run
4. Docker image built and pushed
5. ECS service updated
6. Health checks verified

### Production
- Manual deployment workflow (to be implemented)
- Requires approval from authorized team member
- Blue-green deployment strategy

## Security

### Image Scanning
- Trivy scans all images for vulnerabilities
- Fails on HIGH/CRITICAL vulnerabilities

### Secrets Management
- AWS Secrets Manager for sensitive data
- No secrets in code or environment variables
- OIDC for AWS authentication (no long-lived credentials)

## Monitoring

### Deployment Verification
- ECS service health checks
- ALB target group health
- Application-level health endpoints

### Rollback
- Automated rollback on deployment failure
- Previous task definitions retained
- State file versioning in S3

## Local Development

### Testing Workflows Locally
```bash
# Install act (GitHub Actions local runner)
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run workflow locally
act push -W .github/workflows/api-ci.yml
```

### Terraform Operations
```bash
cd infrastructure/terraform/environments/production

# Initialize backend
terraform init

# Plan changes
terraform plan

# Apply changes
terraform apply
```

## Troubleshooting

### Common Issues

**Deployment Fails with "Task failed container health checks"**
- Check CloudWatch logs: `/ecs/omnirapeutic-production/{service}`
- Verify environment variables are set correctly
- Ensure ALB target group health checks are passing

**State Locking Issues**
- Check DynamoDB table for stuck locks
- Manually remove lock if needed:
  ```bash
  aws dynamodb delete-item \
    --table-name omnirapeutic-terraform-locks \
    --key '{"LockID": {"S": "omnirapeutic-terraform-state/production/terraform.tfstate"}}'
  ```

**ECR Push Failures**
- Verify IAM role has ECR permissions
- Check GitHub Actions role trust policy
- Ensure ECR repository exists

## Maintenance

### Cleaning Up Old Images
```bash
# List images
aws ecr list-images --repository-name omnirapeutic-production-api

# Delete old images (keep last 10)
aws ecr describe-images \
  --repository-name omnirapeutic-production-api \
  --query 'sort_by(imageDetails,& imagePushedAt)[:-10].[imageDigest]' \
  --output text | xargs -I {} aws ecr batch-delete-image \
  --repository-name omnirapeutic-production-api \
  --image-ids imageDigest={}
```

### State File Backup
- S3 versioning enabled
- Automatic backups before major changes
- Retention: 30 days for deleted versions

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Implement production deployment workflow
- [ ] Add Slack/email notifications
- [ ] Performance monitoring integration
- [ ] Automated database migrations
- [ ] Canary deployments for production
- [ ] Cost optimization alerts
