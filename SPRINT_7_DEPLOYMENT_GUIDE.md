# Sprint 7 Deployment Guide
## Security Hardening & Break-the-Glass (BTG) Emergency Access

**Sprint**: 7
**Date**: 2025-11-25
**HIPAA Compliance**: § 164.308(a)(4)(ii)(C) - Emergency Access Procedure

---

## 🎯 Deployment Overview

This deployment includes critical security hardening and HIPAA-compliant emergency access procedures. **This must be deployed before Sprint 8** to ensure proper risk isolation and validation of security controls.

### What's Included in Sprint 7

1. **AWS WAF Rate Limiting** - Auth-specific protection (100 req/5min)
2. **Dependency Vulnerability Scanning** - CI/CD pipeline integration
3. **Break-the-Glass (BTG) Emergency Access System**
   - Database schema with time-bound grants
   - Full CRUD API endpoints
   - Authorization middleware integration
   - CloudWatch CRITICAL/HIGH alerting
   - Comprehensive audit logging
   - 28 automated tests
   - Security documentation

### Deployment Risk Level: **MEDIUM**

- Database migration required (new table + indexes)
- Infrastructure changes (WAF, CloudWatch)
- Authorization logic changes

---

## 📋 Pre-Deployment Checklist

### Code Review
- [ ] All Sprint 7 code reviewed and approved
- [ ] TypeScript compilation successful (`npx tsc --noEmit`)
- [ ] All tests passing (`npm test`)
- [ ] Security documentation reviewed

### Infrastructure Review
- [ ] Terraform changes reviewed (WAF, CloudWatch alarms)
- [ ] Database migration script reviewed
- [ ] Rollback plan documented

### Communication
- [ ] Deployment window scheduled and communicated
- [ ] On-call engineer assigned
- [ ] Security team notified (for CloudWatch alert validation)

---

## 🚀 Deployment Steps

### Phase 1: Staging Deployment

#### 1.1 Database Migration (Staging)

```bash
# Navigate to API directory
cd /root/projects/omnirapeutic/api

# Verify DATABASE_URL points to staging
echo $DATABASE_URL

# Run migration
npx prisma migrate deploy

# Verify migration applied
npx prisma migrate status

# Expected output: "Database schema is up to date!"
```

**Validation**:
```sql
-- Connect to staging database
-- Verify btg_access_grants table exists
\dt btg_access_grants

-- Verify indexes were created
\d btg_access_grants

-- Expected: 5 indexes (primary key + 5 custom indexes)
```

#### 1.2 Application Deployment (Staging)

```bash
# Push to main branch (triggers CI/CD)
git push origin sprint-7-security-hardening-btg

# Monitor GitHub Actions
gh run list --branch main --limit 1

# Wait for deployment to complete
gh run watch
```

#### 1.3 Infrastructure Deployment (Staging)

```bash
# Navigate to infrastructure directory
cd /root/projects/omnirapeutic/infrastructure/terraform

# Initialize and plan
terraform init
terraform plan -var-file=environments/staging.tfvars

# Review changes:
# - WAF Rule 5 (AuthEndpointRateLimitRule)
# - CloudWatch Metric Filters (2)
# - CloudWatch Alarms (2)

# Apply changes
terraform apply -var-file=environments/staging.tfvars

# Verify resources created
aws wafv2 list-web-acls --scope REGIONAL --region us-east-1
aws cloudwatch describe-alarms --alarm-names \
  "omnirapeutic-staging-btg-grant-access-CRITICAL" \
  "omnirapeutic-staging-btg-use-access-HIGH"
```

---

### Phase 2: Staging Validation

#### 2.1 WAF Rate Limiting Test

```bash
# Test authentication endpoint rate limiting
# This should trigger WAF after 100 requests in 5 minutes

for i in {1..110}; do
  curl -X POST https://api.staging.omnirapeutic.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' \
    -w "\n%{http_code}\n" \
    -s
done

# Expected: First 100 return 401, then 429 (Too Many Requests)
```

**Success Criteria**: ✅
- First ~100 requests return 401 (Unauthorized)
- Subsequent requests return 429 (Rate Limited)
- Custom error message: "Rate limit exceeded. Please try again later."

#### 2.2 Dependency Scanning Test

```bash
# Trigger CI/CD pipeline
git commit --allow-empty -m "Test: Trigger CI/CD for vulnerability scanning"
git push

# Monitor pipeline
gh run watch

# Check for npm audit step in logs
gh run view --log | grep "npm audit"

# Expected: npm audit runs and reports vulnerabilities
```

**Success Criteria**: ✅
- npm audit step runs in CI/CD
- Build fails if high/critical vulnerabilities found
- Audit report uploaded as artifact

#### 2.3 BTG System Test

**Test Scenario**: Create BTG grant → Use access → Verify alerts → Revoke grant

**Step 1: Get Admin JWT Token**
```bash
# Login as admin
ADMIN_TOKEN=$(curl -X POST https://api.staging.omnirapeutic.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@omnirapeutic.com","password":"Admin123!@#"}' \
  -s | jq -r '.token')

echo $ADMIN_TOKEN
```

**Step 2: Create Test Patient**
```bash
# Create test patient for BTG testing
PATIENT_RESPONSE=$(curl -X POST https://api.staging.omnirapeutic.com/api/patients \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "firstName": "Test",
    "lastName": "Patient",
    "dateOfBirth": "1990-01-01",
    "medicalRecordNumber": "TEST-BTG-001",
    "phoneNumber": "555-0100"
  }' \
  -s)

PATIENT_ID=$(echo $PATIENT_RESPONSE | jq -r '.patient.id')
echo "Patient ID: $PATIENT_ID"
```

**Step 3: Create BTG Grant**
```bash
# Get second admin user ID (or use same admin for testing)
ADMIN_USER_ID=$(curl -X GET https://api.staging.omnirapeutic.com/api/auth/me \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -s | jq -r '.user.id')

# Create BTG grant
BTG_RESPONSE=$(curl -X POST https://api.staging.omnirapeutic.com/api/admin/btg/grants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"grantedToUserId\": \"$ADMIN_USER_ID\",
    \"patientId\": \"$PATIENT_ID\",
    \"justification\": \"STAGING TEST: Validating BTG emergency access system for deployment verification and CloudWatch alerting\",
    \"durationMinutes\": 60
  }" \
  -s)

GRANT_ID=$(echo $BTG_RESPONSE | jq -r '.grantId')
echo "BTG Grant ID: $GRANT_ID"
echo "Full Response: $BTG_RESPONSE"
```

**Success Criteria**: ✅
- HTTP 201 Created
- Response includes: `success: true`, `grantId`, `expiresAt`, `message`
- Audit log entry created in database

**Step 4: Verify CloudWatch CRITICAL Alert**
```bash
# Check CloudWatch Logs for BTG grant event
aws logs tail /aws/ecs/omnirapeutic-staging-api --since 5m --format short | grep BTG_GRANT_ACCESS

# Expected JSON log output:
# {
#   "timestamp": "2025-11-25T...",
#   "level": "SECURITY",
#   "action": "BTG_GRANT_ACCESS",
#   "grantId": "...",
#   "justification": "...",
#   ...
# }

# Check CloudWatch Alarm State (should be in ALARM state)
aws cloudwatch describe-alarms --alarm-names "omnirapeutic-staging-btg-grant-access-CRITICAL"

# Expected: "StateValue": "ALARM"
```

**Success Criteria**: ✅
- CloudWatch Log contains BTG_GRANT_ACCESS event with full JSON
- CloudWatch CRITICAL alarm is in ALARM state
- SNS notification sent to security team email

**Step 5: Use BTG Access**
```bash
# Access patient record using BTG grant
curl -X GET "https://api.staging.omnirapeutic.com/api/patients/$PATIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -s | jq

# Check audit log for BTG usage
aws logs tail /aws/ecs/omnirapeutic-staging-api --since 2m --format short | grep BTG_USE_ACCESS
```

**Success Criteria**: ✅
- Patient data returned successfully
- Audit log shows `BTG_USE_ACCESS` action
- CloudWatch HIGH alarm triggered
- Audit log includes `accessMethod: "break_the_glass"`

**Step 6: List Active Grants**
```bash
# List all active BTG grants
curl -X GET "https://api.staging.omnirapeutic.com/api/admin/btg/grants?status=active" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -s | jq

# Expected: Array with our grant, includes patient and user details
```

**Success Criteria**: ✅
- HTTP 200 OK
- Response includes grants array with our test grant
- Grant includes: grantedByUser, grantedToUser, patient details

**Step 7: Revoke BTG Grant**
```bash
# Revoke the grant
curl -X POST "https://api.staging.omnirapeutic.com/api/admin/btg/grants/$GRANT_ID/revoke" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "STAGING TEST: Validation completed successfully"
  }' \
  -s | jq

# Verify grant is revoked
curl -X GET "https://api.staging.omnirapeutic.com/api/admin/btg/grants?status=active" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -s | jq '.count'

# Expected: count should be 0 (no active grants)
```

**Success Criteria**: ✅
- HTTP 200 OK
- Response: `success: true`, `message: "Emergency access revoked successfully"`
- Audit log shows `BTG_REVOKE_ACCESS` action
- Grant no longer appears in active grants list

#### 2.4 Smoke Tests

**Test existing functionality to ensure no regressions**:

```bash
# Test 1: Health check
curl https://api.staging.omnirapeutic.com/health

# Expected: HTTP 200, {"status":"ok"}

# Test 2: Login (existing functionality)
curl -X POST https://api.staging.omnirapeutic.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@omnirapeutic.com","password":"Admin123!@#"}' \
  -s | jq

# Expected: HTTP 200, returns token

# Test 3: List patients (existing functionality)
curl -X GET "https://api.staging.omnirapeutic.com/api/patients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -s | jq '.pagination'

# Expected: HTTP 200, returns patient list
```

**Success Criteria**: ✅
- All existing endpoints return expected responses
- No 500 errors in application logs
- Response times within normal range

#### 2.5 Database Audit Log Verification

```sql
-- Connect to staging database
psql $DATABASE_URL

-- Query BTG grant audit logs
SELECT
  timestamp,
  action,
  details->>'grantId' as grant_id,
  details->>'patientMRN' as patient_mrn,
  details->>'justification' as justification
FROM audit_logs
WHERE action IN ('BTG_GRANT_ACCESS', 'BTG_USE_ACCESS', 'BTG_REVOKE_ACCESS')
ORDER BY timestamp DESC
LIMIT 10;

-- Verify BTG grants table
SELECT
  id,
  granted_by_user_id,
  granted_to_user_id,
  patient_id,
  duration_minutes,
  expires_at,
  revoked_at,
  created_at
FROM btg_access_grants
ORDER BY created_at DESC
LIMIT 5;

-- Expected: See our test grant with revoked_at timestamp
```

**Success Criteria**: ✅
- Audit logs contain all BTG actions (grant, use, revoke)
- BTG grants table contains test grant with revocation timestamp
- All timestamps are correct and in UTC

---

### Phase 3: Production Deployment

**STOP**: Only proceed if ALL staging validation tests pass ✅

#### 3.1 Production Deployment Approval

**Required Approvals**:
- [ ] Technical Lead sign-off on staging validation
- [ ] Security Team confirmation of CloudWatch alerts
- [ ] Compliance Officer approval (if required)

**Pre-Production Checks**:
- [ ] Rollback plan ready and tested
- [ ] Database backup completed and verified
- [ ] On-call engineer available
- [ ] Monitoring dashboards open

#### 3.2 Database Migration (Production)

```bash
# Switch to production DATABASE_URL
export DATABASE_URL="postgresql://..."  # Production connection string

# CRITICAL: Create manual database backup first
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier omnirapeutic-production \
  --db-cluster-snapshot-identifier sprint7-pre-deployment-$(date +%Y%m%d-%H%M%S)

# Wait for snapshot to complete
aws rds wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier sprint7-pre-deployment-...

# Run migration
cd /root/projects/omnirapeutic/api
npx prisma migrate deploy

# Verify migration
npx prisma migrate status
```

**Success Criteria**: ✅
- Manual backup created and available
- Migration applied successfully
- No errors in migration log

#### 3.3 Application Deployment (Production)

```bash
# Deploy to production (via your deployment mechanism)
# This varies based on your CI/CD setup

# Option A: Manual promotion from staging
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service api \
  --force-new-deployment

# Option B: GitHub Actions deployment
gh workflow run deploy-production.yml

# Monitor deployment
aws ecs wait services-stable \
  --cluster omnirapeutic-production \
  --services api

# Verify new tasks are running
aws ecs describe-services \
  --cluster omnirapeutic-production \
  --services api | jq '.services[0].runningCount'
```

#### 3.4 Infrastructure Deployment (Production)

```bash
# Deploy Terraform changes to production
cd /root/projects/omnirapeutic/infrastructure/terraform

terraform plan -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars

# Verify WAF and CloudWatch resources
aws wafv2 list-web-acls --scope REGIONAL --region us-east-1
aws cloudwatch describe-alarms --alarm-names \
  "omnirapeutic-production-btg-grant-access-CRITICAL"
```

#### 3.5 Production Validation (Abbreviated)

**⚠️ Use CAUTION: This is production with real PHI**

```bash
# Test 1: Health check
curl https://api.omnirapeutic.com/health

# Test 2: WAF rate limiting (use test account ONLY)
# Do NOT test with real user accounts

# Test 3: Monitor CloudWatch for any errors
aws logs tail /aws/ecs/omnirapeutic-production-api --since 5m --follow

# Test 4: Verify BTG endpoints are accessible (do NOT create test grants in production)
curl -X GET "https://api.omnirapeutic.com/api/admin/btg/config" \
  -H "Authorization: Bearer $PROD_ADMIN_TOKEN" \
  -s | jq

# Expected: Returns BTG configuration (allowed durations, etc.)
```

**Success Criteria**: ✅
- Health check passes
- No errors in application logs
- BTG config endpoint accessible
- CloudWatch alarms configured and ready

---

## 🔄 Rollback Plan

### If Issues Are Detected

#### Rollback Database Migration

```bash
# Rollback to previous migration
cd /root/projects/omnirapeutic/api

# View migration history
npx prisma migrate status

# Rollback by restoring from pre-deployment snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier omnirapeutic-production-rollback \
  --snapshot-identifier sprint7-pre-deployment-... \
  --engine aurora-postgresql

# Update DNS/connection strings to point to rollback cluster
```

#### Rollback Application

```bash
# Revert to previous ECS task definition
aws ecs update-service \
  --cluster omnirapeutic-production \
  --service api \
  --task-definition omnirapeutic-api:PREVIOUS_VERSION

# Or revert git commit and redeploy
git revert HEAD
git push origin main
```

#### Rollback Infrastructure

```bash
# Revert Terraform changes
cd /root/projects/omnirapeutic/infrastructure/terraform
git revert HEAD
terraform apply -var-file=environments/production.tfvars
```

---

## 📊 Post-Deployment Validation

### Success Metrics (24 Hours After Production Deployment)

- [ ] Zero 5xx errors related to BTG or authorization
- [ ] WAF blocking rate-limited requests (check CloudWatch metrics)
- [ ] No false-positive BTG alerts
- [ ] Application performance unchanged (p95 latency)
- [ ] Database performance unchanged

### Monitoring Checklist

**Week 1 Post-Deployment**:
- [ ] Day 1: Review all CloudWatch alarms
- [ ] Day 2: Check audit logs for BTG activity
- [ ] Day 3: Verify WAF metrics
- [ ] Day 7: Review week 1 summary with team

**Report Template**:
```
Sprint 7 Deployment - Week 1 Summary
Date: [DATE]
Environment: Production

Metrics:
- BTG grants created: [COUNT]
- BTG alerts triggered: [COUNT]
- WAF requests blocked: [COUNT]
- 5xx errors: [COUNT]
- Average response time: [MS]

Issues:
- [None / List issues]

Recommendations:
- [Continue monitoring / Adjust thresholds / etc.]
```

---

## 📚 Reference Documentation

- **BTG Security Documentation**: `api/BTG_SECURITY_DOCUMENTATION.md`
- **HIPAA Compliance**: § 164.308(a)(4)(ii)(C) - Emergency Access Procedure
- **Sprint 7 Implementation**: See Pull Request #[NUMBER]

---

## 👥 Contacts

- **Technical Lead**: [NAME]
- **Security Team**: security@omnirapeutic.com
- **On-Call Engineer**: [PAGERDUTY/OPSGENIE]
- **HIPAA Compliance Officer**: compliance@omnirapeutic.com

---

## ✅ Deployment Sign-Off

**Staging Deployment**:
- Date/Time: _______________
- Deployed By: _______________
- Validation Status: _______________
- Sign-Off: _______________

**Production Deployment**:
- Date/Time: _______________
- Deployed By: _______________
- Validation Status: _______________
- Sign-Off: _______________

---

**Document Version**: 1.0
**Last Updated**: 2025-11-25
**Next Review**: After Sprint 7 production deployment
