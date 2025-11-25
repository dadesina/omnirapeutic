# Omnirapeutic - HIPAA-Compliant Healthcare Platform

Modern healthcare platform with AI-driven clinical decision support, built with HIPAA compliance from the ground up.

---

## Project Status

**Current Phase:** Phase 1 - Foundation (COMPLETE)

- ✅ Infrastructure as Code (Terraform)
- ✅ Multi-AZ VPC with network segmentation
- ✅ Aurora PostgreSQL Serverless v2
- ✅ KMS encryption and Secrets Manager
- ✅ CI/CD pipeline (GitHub Actions)
- ⏳ Phase 2 - Supabase Self-Hosting (Next)

---

## Quick Start

Get your HIPAA-compliant infrastructure up and running:

```bash
# 1. Install prerequisites
./infrastructure/scripts/install-prerequisites.sh

# 2. Configure AWS credentials
aws configure

# 3. Verify prerequisites
./infrastructure/scripts/check-prerequisites.sh

# 4. Deploy infrastructure
./infrastructure/scripts/setup.sh
```

**See:** `QUICKSTART.md` for detailed deployment instructions

---

## Documentation

### Getting Started
- **[QUICKSTART.md](QUICKSTART.md)** - Quick deployment guide
- **[PREREQUISITES_SETUP_GUIDE.md](PREREQUISITES_SETUP_GUIDE.md)** - Complete prerequisites setup
- **[infrastructure/README.md](infrastructure/README.md)** - Infrastructure architecture

### Implementation Details
- **[PHASE_1_IMPLEMENTATION_SUMMARY.md](PHASE_1_IMPLEMENTATION_SUMMARY.md)** - Phase 1 complete implementation
- **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** - Full multi-phase implementation plan
- **[TECHNOLOGY_STACK_RECOMMENDATION.md](TECHNOLOGY_STACK_RECOMMENDATION.md)** - Technology stack rationale

### Product & Strategy
- **[Comprehensive PRD - Omnirapeutic.md](Comprehensive%20PRD%20-%20Omnirapeutic.md)** - Product requirements
- **[GTM_STRATEGY.md](GTM_STRATEGY.md)** - Go-to-market strategy
- **[TESTING_STRATEGY.md](TESTING_STRATEGY.md)** - QA and testing approach

---

## Architecture Overview

### Network Architecture (Phase 1 - DEPLOYED)

```
VPC (10.0.0.0/16) - 3 Availability Zones
├── Public Subnets (10.0.1-3.0/24)
│   ├── Internet Gateway
│   └── NAT Gateways (2 for HA)
├── Private App Subnets (10.0.11-13.0/24)
│   └── Reserved for ECS Fargate (Phase 2)
└── Private Data Subnets (10.0.21-23.0/24)
    └── Aurora PostgreSQL Serverless v2
```

### Security & Compliance

- ✅ HIPAA-compliant infrastructure design
- ✅ Encryption at rest (KMS) and in transit (TLS)
- ✅ 35-day backup retention
- ✅ Multi-AZ for high availability
- ✅ VPC Flow Logs for audit trail
- ⚠️  **Required:** AWS BAA must be signed before production use

### Technology Stack

**Infrastructure:**
- AWS (VPC, Aurora, KMS, Secrets Manager, ECS)
- Terraform for Infrastructure as Code
- GitHub Actions for CI/CD

**Backend (Phase 2+):**
- Self-hosted Supabase on ECS Fargate
- NestJS API Gateway
- PostgreSQL 15 with pgAudit

**Frontend (Phase 3+):**
- React with TypeScript
- Tailwind CSS + shadcn/ui

**AI/ML (Phase 4+):**
- AWS Bedrock (Claude, HealthScribe)
- LangChain for orchestration

---

## Prerequisites

Before deploying infrastructure, you need:

### Required Tools
- Terraform >= 1.5.0
- AWS CLI >= 2.0
- Git

### AWS Requirements
- AWS Account with admin access
- AWS credentials configured
- **AWS Business Associate Agreement (BAA) signed** (for HIPAA compliance)

### Cost Considerations
- **Phase 1 Monthly Cost:** $905-1,105/month
  - NAT Gateways: $150
  - Aurora Serverless v2: $600-800
  - Other services: $155-255

**See:** `PREREQUISITES_SETUP_GUIDE.md` for complete setup instructions

---

## Deployment

### Option 1: Automated Setup (Recommended)

```bash
./infrastructure/scripts/setup.sh
```

### Option 2: Manual Setup

```bash
cd infrastructure/terraform/environments/production
terraform init
terraform plan
terraform apply
```

### Verification

```bash
./infrastructure/scripts/verify.sh
```

**See:** `QUICKSTART.md` for detailed deployment steps

---

## Helper Scripts

All scripts located in `infrastructure/scripts/`:

- **install-prerequisites.sh** - Install Terraform, AWS CLI
- **check-prerequisites.sh** - Verify all prerequisites met
- **setup.sh** - Interactive infrastructure deployment
- **verify.sh** - Verify deployment health and compliance

---

## Project Structure

```
omnirapeutic/
├── infrastructure/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── vpc/           # Multi-AZ VPC module
│   │   │   ├── aurora/        # Aurora PostgreSQL module
│   │   │   └── security/      # KMS and Secrets Manager
│   │   └── environments/
│   │       └── production/    # Production environment config
│   ├── scripts/               # Helper scripts
│   └── README.md              # Infrastructure documentation
├── .github/
│   └── workflows/             # CI/CD pipelines
├── QUICKSTART.md              # Quick deployment guide
├── PREREQUISITES_SETUP_GUIDE.md  # Prerequisites setup
└── README.md                  # This file
```

---

## Phase Roadmap

### ✅ Phase 1: Foundation (Weeks 1-2) - COMPLETE
- Multi-AZ VPC with network segmentation
- Aurora PostgreSQL Serverless v2
- KMS encryption and Secrets Manager
- CI/CD pipeline

### ⏳ Phase 2: Supabase Self-Hosting (Weeks 3-4)
- ECS Fargate cluster
- Supabase containers (Kong, PostgREST, GoTrue, Realtime)
- ElastiCache Redis
- Application Load Balancer

### 📋 Phase 3: Data Layer (Weeks 5-6)
- Database schema implementation
- Row-level security policies
- Data validation
- Migration scripts

### 📋 Phase 4: Application Development (Weeks 7-10)
- NestJS API Gateway
- React web application
- Authentication and authorization
- Core clinical workflows

### 📋 Phase 5: AI/ML Integration (Weeks 11-12)
- AWS Bedrock integration
- Clinical decision support
- Patient risk stratification
- Treatment recommendations

### 📋 Phase 6: Security & Compliance Hardening (Weeks 13-14)
- HIPAA compliance audit
- Security testing
- Performance optimization
- Production readiness

**See:** `IMPLEMENTATION_PLAN.md` for detailed phase breakdown

---

## Cost Estimates

### Phase 1 (Current)
- **Monthly:** $905-1,105
- **Annual:** ~$11,000-13,000

### Phase 2 (Supabase + ECS)
- **Monthly:** $1,505-1,755
- **Annual:** ~$18,000-21,000

### Phase 3+ (Full Application)
- **Monthly:** $2,200-2,800
- **Annual:** ~$26,000-34,000

**Note:** Costs scale with usage. AWS Free Tier available for development.

---

## Security Checklist

Before deploying to production:

- [ ] AWS Business Associate Agreement (BAA) signed
- [ ] MFA enabled on AWS root account
- [ ] IAM least privilege policies configured
- [ ] CloudTrail organization trail enabled
- [ ] AWS Config with HIPAA conformance packs
- [ ] AWS GuardDuty enabled
- [ ] Secrets Manager access restricted
- [ ] Regular security reviews scheduled
- [ ] Incident response plan documented
- [ ] Backup and disaster recovery tested

---

## Support & Resources

### Documentation
- Infrastructure: `infrastructure/README.md`
- Prerequisites: `PREREQUISITES_SETUP_GUIDE.md`
- Quick Start: `QUICKSTART.md`

### AWS Resources
- [HIPAA on AWS](https://aws.amazon.com/compliance/hipaa-compliance/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS BAA Information](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/)

### Troubleshooting
- Check `QUICKSTART.md` troubleshooting section
- Review CloudWatch logs for infrastructure issues
- Verify AWS BAA is signed before production deployment

---

## Contributing

This is a private healthcare platform. All contributions must:
1. Maintain HIPAA compliance
2. Include security review
3. Pass all automated tests
4. Update documentation

---

## License

Proprietary - All Rights Reserved

---

## Contact

For questions or support, refer to project documentation or contact the development team.

---

**Last Updated:** 2025-11-24
**Phase 1 Status:** COMPLETE ✅
**Next Phase:** Phase 2 - Supabase Self-Hosting
