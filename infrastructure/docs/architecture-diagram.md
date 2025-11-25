# Architecture Diagram - Omnirapeutic Production Infrastructure

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Network Architecture](#network-architecture)
3. [Security Architecture](#security-architecture)
4. [Data Flow](#data-flow)
5. [Component Details](#component-details)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS us-east-1 Region                           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         VPC (10.0.0.0/16)                             │ │
│  │                                                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │ │
│  │  │   AZ us-east-1a │  │   AZ us-east-1b │  │   AZ us-east-1c │     │ │
│  │  │                 │  │                 │  │                 │     │ │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │     │ │
│  │  │  │  Public   │  │  │  │  Public   │  │  │  │  Public   │  │     │ │
│  │  │  │  Subnet   │  │  │  │  Subnet   │  │  │  │  Subnet   │  │     │ │
│  │  │  │ .1.0/24   │  │  │  │ .2.0/24   │  │  │  │ .3.0/24   │  │     │ │
│  │  │  │           │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  │ ┌───────┐ │  │  │  │ ┌───────┐ │  │  │  │ ┌───────┐ │  │     │ │
│  │  │  │ │  NAT  │ │  │  │  │ │  NAT  │ │  │  │  │ │  NAT  │ │  │     │ │
│  │  │  │ │  GW   │ │  │  │  │ │  GW   │ │  │  │  │ │  GW   │ │  │     │ │
│  │  │  │ └───────┘ │  │  │  │ └───────┘ │  │  │  │ └───────┘ │  │     │ │
│  │  │  └─────┬─────┘  │  │  └─────┬─────┘  │  │  └─────┬─────┘  │     │ │
│  │  │        │        │  │        │        │  │        │        │     │ │
│  │  │  ┌─────┴─────┐  │  │  ┌─────┴─────┐  │  │  ┌─────┴─────┐  │     │ │
│  │  │  │  Private  │  │  │  │  Private  │  │  │  │  Private  │  │     │ │
│  │  │  │   App     │  │  │  │   App     │  │  │  │   App     │  │     │ │
│  │  │  │  Subnet   │  │  │  │  Subnet   │  │  │  │  Subnet   │  │     │ │
│  │  │  │ .11.0/24  │  │  │  │ .12.0/24  │  │  │  │ .13.0/24  │  │     │ │
│  │  │  │           │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  │ ┌───────┐ │  │  │  │ ┌───────┐ │  │  │  │ ┌───────┐ │  │     │ │
│  │  │  │ │  ECS  │ │  │  │  │ │  ECS  │ │  │  │  │ │  ECS  │ │  │     │ │
│  │  │  │ │ Tasks │ │  │  │  │ │ Tasks │ │  │  │  │ │ Tasks │ │  │     │ │
│  │  │  │ └───────┘ │  │  │  │ └───────┘ │  │  │  │ └───────┘ │  │     │ │
│  │  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │     │ │
│  │  │                 │  │                 │  │                 │     │ │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │     │ │
│  │  │  │  Private  │  │  │  │  Private  │  │  │  │  Private  │  │     │ │
│  │  │  │   Data    │  │  │  │   Data    │  │  │  │   Data    │  │     │ │
│  │  │  │  Subnet   │  │  │  │  Subnet   │  │  │  │  Subnet   │  │     │ │
│  │  │  │ .21.0/24  │  │  │  │ .22.0/24  │  │  │  │ .23.0/24  │  │     │ │
│  │  │  │           │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  │ ┌───────┐ │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  │ │Aurora │ │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  │ │Writer │ │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  │ └───────┘ │  │  │  │           │  │  │  │           │  │     │ │
│  │  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │     │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐    │ │
│  │  │                 Application Load Balancer                    │    │ │
│  │  │               (Internet-facing, Multi-AZ)                    │    │ │
│  │  │         omnirapeutic-production-alb-*.elb.amazonaws.com     │    │ │
│  │  └─────────────────────────────────────────────────────────────┘    │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         Security & Monitoring                         │ │
│  │                                                                       │ │
│  │  [WAF]  [KMS]  [Secrets Manager]  [CloudWatch]  [CloudTrail]        │ │
│  │  [Config]  [GuardDuty]  [VPC Flow Logs]  [ECR]                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Internet
                                    ▼
                            [ End Users ]
```

## Network Architecture

### VPC Layout

```
VPC: 10.0.0.0/16
├── Public Subnets (Internet Gateway attached)
│   ├── 10.0.1.0/24 (us-east-1a) - NAT Gateway 1
│   ├── 10.0.2.0/24 (us-east-1b) - NAT Gateway 2
│   └── 10.0.3.0/24 (us-east-1c) - NAT Gateway 3
│
├── Private App Subnets (NAT Gateway for outbound)
│   ├── 10.0.11.0/24 (us-east-1a) - ECS Tasks
│   ├── 10.0.12.0/24 (us-east-1b) - ECS Tasks
│   └── 10.0.13.0/24 (us-east-1c) - ECS Tasks
│
└── Private Data Subnets (NAT Gateway for outbound)
    ├── 10.0.21.0/24 (us-east-1a) - Aurora Writer, Bastion
    ├── 10.0.22.0/24 (us-east-1b) - Aurora Replica (future)
    └── 10.0.23.0/24 (us-east-1c) - Aurora Replica (future)
```

### Route Tables

**Public Subnet Route Table**:
```
Destination         Target
10.0.0.0/16        local
0.0.0.0/0          igw-xxxxx (Internet Gateway)
```

**Private App Subnet Route Tables** (one per AZ):
```
Destination         Target
10.0.0.0/16        local
0.0.0.0/0          nat-xxxxx (NAT Gateway in same AZ)
```

**Private Data Subnet Route Tables** (one per AZ):
```
Destination         Target
10.0.0.0/16        local
0.0.0.0/0          nat-xxxxx (NAT Gateway in same AZ)
```

## Security Architecture

### Security Groups

```
┌────────────────────────────────────────────────────────────────────┐
│                           Internet                                 │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              │ HTTP (80), HTTPS (443)
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    ALB Security Group                              │
│  Inbound:  0.0.0.0/0 → 80, 443                                    │
│  Outbound: ECS Security Group → All Ports                         │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              │ All TCP Ports
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    ECS Security Group                              │
│  Inbound:  ALB Security Group → All TCP                           │
│  Outbound: 0.0.0.0/0 → All (for internet access via NAT)         │
│            Aurora Security Group → 5432                           │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              │ PostgreSQL (5432)
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   Aurora Security Group                            │
│  Inbound:  ECS Security Group → 5432                              │
│            Bastion Security Group → 5432                          │
│  Outbound: None                                                   │
└────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ PostgreSQL (5432)
                              │
┌────────────────────────────────────────────────────────────────────┐
│                   Bastion Security Group                           │
│  Inbound:  None (SSM Session Manager only)                        │
│  Outbound: 0.0.0.0/0 → All (for SSM and internet access)         │
│            Aurora Security Group → 5432                           │
└────────────────────────────────────────────────────────────────────┘
```

### WAF Protection Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Internet                                 │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS WAF (Regional)                               │
│  Rule Priority 1: AWS Managed Common Rule Set (OWASP Top 10)       │
│  Rule Priority 2: AWS Managed Known Bad Inputs                     │
│  Rule Priority 3: AWS Managed SQL Injection Protection             │
│  Rule Priority 4: Rate Limiting (2000 req/5min per IP)             │
│                                                                     │
│  Default Action: Allow                                              │
│  Blocked Requests → CloudWatch Metrics                              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ Legitimate Traffic Only
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Application Load Balancer                        │
│  Listener: HTTP (80) → HTTP (443 with certificate, future)         │
│  Target Groups: api, web (by path pattern)                         │
│  Health Checks: / (web), /health (api)                             │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ECS Services (Fargate)                        │
│  - omnirapeutic-production-api (2 tasks)                           │
│  - omnirapeutic-production-web (2 tasks)                           │
│  - omnirapeutic-production-worker (1 task)                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AWS KMS Keys                                  │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   Aurora KMS     │  │    S3 KMS        │  │  Secrets KMS     │ │
│  │      Key         │  │     Key          │  │     Key          │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
│           │                     │                      │           │
└───────────┼─────────────────────┼──────────────────────┼───────────┘
            │                     │                      │
            │ Encrypts            │ Encrypts             │ Encrypts
            │                     │                      │
            ▼                     ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│  Aurora Cluster  │  │  S3 Buckets:     │  │  Secrets Manager     │
│  - Data at rest  │  │  - CloudTrail    │  │  - DB passwords      │
│  - Backups       │  │  - ALB logs      │  │  - API keys          │
│  - Snapshots     │  │                  │  │  - Certificates      │
└──────────────────┘  └──────────────────┘  │                      │
                                             │  ECR Repositories    │
                                             │  - Container images  │
                                             │                      │
                                             │  SNS Topics          │
                                             │  - Alarm messages    │
                                             └──────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Encryption in Transit                            │
│                                                                     │
│  Internet → ALB:  HTTPS (TLS 1.2+, when certificate configured)    │
│  ALB → ECS:       HTTP (within VPC)                                │
│  ECS → Aurora:    PostgreSQL SSL (enforced)                        │
│  ECS → Secrets:   HTTPS (TLS 1.2+)                                 │
│  ECS → ECR:       HTTPS (TLS 1.2+)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### User Request Flow

```
1. User Request
   │
   ▼
2. DNS Resolution
   omnirapeutic-production-alb-941266984.us-east-1.elb.amazonaws.com
   │
   ▼
3. AWS WAF Inspection
   - Check managed rules (OWASP, Bad Inputs, SQLi)
   - Check rate limit (2000 req/5min per IP)
   - Block or Allow
   │
   ▼ (Allowed)
4. Application Load Balancer
   - TLS termination (when HTTPS configured)
   - Path-based routing:
     * /api/* → API target group
     * /*     → Web target group
   │
   ▼
5. Target Group Health Check
   - Verify target is healthy
   - Route to healthy target only
   │
   ▼
6. ECS Task (Fargate)
   - Container receives request
   - Process application logic
   │
   ▼
7. Database Query (if needed)
   - ECS → Aurora (via security group)
   - PostgreSQL SSL connection
   - pgAudit logs query
   │
   ▼
8. Response
   - ECS → ALB → WAF → User
   │
   ▼
9. Logging & Monitoring
   - ECS logs → CloudWatch Logs
   - ALB metrics → CloudWatch Metrics
   - WAF metrics → CloudWatch Metrics
   - Alarms triggered if thresholds exceeded
```

### Deployment Flow

```
1. Build Docker Image
   │
   ▼
2. Authenticate to ECR
   aws ecr get-login-password
   │
   ▼
3. Tag and Push Image
   docker tag app:latest <account>.dkr.ecr.us-east-1.amazonaws.com/repo:tag
   docker push ...
   │
   ▼
4. ECR Image Scan
   - Scan for vulnerabilities
   - Store scan results
   │
   ▼
5. Register Task Definition
   - Reference new ECR image
   - Set CPU/memory
   - Configure environment variables
   - Link secrets from Secrets Manager
   │
   ▼
6. Update ECS Service
   - Update to new task definition
   - Rolling deployment:
     * Start new tasks
     * Wait for health checks
     * Drain old tasks
     * Stop old tasks
   │
   ▼
7. ALB Health Checks
   - Monitor new task health
   - Add to target group when healthy
   │
   ▼
8. CloudWatch Monitoring
   - Track deployment progress
   - Monitor for errors
   - Trigger alarms if issues
```

### Bastion Access Flow

```
1. AWS Console or CLI
   aws ssm start-session --target i-xxxxx
   │
   ▼
2. IAM Authentication
   - Verify IAM permissions
   - Check MFA (if required)
   │
   ▼
3. SSM Session Manager
   - No SSH keys required
   - Establish secure session
   │
   ▼
4. Bastion Host (EC2)
   - Private subnet (no public IP)
   - Access to Aurora security group
   │
   ▼
5. Connect to Aurora
   psql -h <aurora-endpoint> -U admin -d omnirapeutic
   │
   ▼
6. Session Logging
   - All commands logged to CloudWatch Logs
   - Audit trail for compliance
```

## Component Details

### ECS Cluster Configuration

**Cluster**: omnirapeutic-production
**Launch Type**: Fargate
**Services**:
- nginx (test): 2 tasks, 0.25 vCPU, 512 MB
- api (future): 2 tasks, 0.5 vCPU, 1024 MB
- web (future): 2 tasks, 0.5 vCPU, 1024 MB
- worker (future): 1 task, 0.5 vCPU, 1024 MB

**Task Execution Role**: Pull images, write logs, read secrets
**Task Role**: Application permissions (S3, SQS, etc.)

### Aurora Configuration

**Engine**: Aurora PostgreSQL Serverless v2
**Version**: 15.10 (LTS)
**Capacity**:
- Minimum: 0.5 ACU (~1 GB RAM, ~45 connections)
- Maximum: 1.0 ACU (~2 GB RAM, ~90 connections)

**High Availability**:
- Multi-AZ deployment
- Automatic failover
- 6 copies of data across 3 AZs

**Backup**:
- Automated daily backups (7-day retention)
- 5-minute point-in-time recovery
- Encrypted with KMS

### Monitoring Stack

**CloudWatch Alarms** (21 total):
- Aurora: 5 alarms
- VPC: 3 alarms
- Cost: 1 alarm
- ALB: 3 alarms
- ECS: 3 alarms
- WAF: 1 alarm
- NAT Gateway: 3 alarms
- VPC Flow Logs: 2 alarms

**Log Groups**:
- ECS: /ecs/omnirapeutic-production/{api,web,worker}
- VPC: /aws/vpc/omnirapeutic-production-flow-logs
- CloudTrail: /aws/cloudtrail/omnirapeutic-production
- SSM: /aws/ssm/omnirapeutic-production-bastion-sessions
- Aurora: /aws/rds/cluster/omnirapeutic-production/postgresql

**Compliance**:
- CloudTrail: All API calls logged
- AWS Config: HIPAA conformance pack
- GuardDuty: Threat detection
- VPC Flow Logs: Network traffic analysis

## Infrastructure as Code

```
terraform/
├── environments/
│   └── production/
│       ├── main.tf              # Root configuration
│       ├── variables.tf         # Input variables
│       ├── outputs.tf           # Exported values
│       ├── terraform.tfvars     # Variable values
│       └── ecs-nginx-service.tf # Test service
│
└── modules/
    ├── vpc/                     # Network infrastructure
    ├── security/                # KMS keys, Secrets Manager
    ├── aurora/                  # Database cluster
    ├── bastion/                 # Bastion host
    ├── ecr/                     # Container registry
    ├── ecs/                     # Container orchestration
    ├── alb/                     # Load balancer
    ├── waf/                     # Web application firewall
    ├── cloudtrail/              # API audit logging
    ├── config/                  # Compliance monitoring
    ├── guardduty/               # Threat detection
    └── alarms/                  # CloudWatch alarms
```

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial architecture documentation |
