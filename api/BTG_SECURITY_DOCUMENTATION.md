# Break-the-Glass (BTG) Emergency Access System

## Overview

The Break-the-Glass (BTG) system provides a secure, audited mechanism for emergency access to patient health information (PHI) when standard access controls would prevent necessary care or system maintenance.

**HIPAA Compliance**: § 164.308(a)(4)(ii)(C) - Emergency Access Procedure

## Table of Contents

1. [Purpose and Use Cases](#purpose-and-use-cases)
2. [Security Requirements](#security-requirements)
3. [API Endpoints](#api-endpoints)
4. [Operational Procedures](#operational-procedures)
5. [Audit and Monitoring](#audit-and-monitoring)
6. [Emergency Response Runbook](#emergency-response-runbook)
7. [Compliance and Retention](#compliance-and-retention)

---

## Purpose and Use Cases

### When to Use BTG

BTG emergency access should ONLY be used in the following scenarios:

1. **System Emergencies**
   - Database corruption requiring ADMIN to investigate specific patient records
   - System failures where ADMIN needs to verify data integrity
   - Technical debugging that requires access to production PHI

2. **Emergency Medical Situations** (Future Use Case)
   - Life-threatening situations requiring immediate access to patient records
   - When normal access channels are unavailable

### When NOT to Use BTG

- **Regular system administration** - Use standard ADMIN access
- **Routine data queries** - Use standard PRACTITIONER access
- **Development or testing** - Use test data, never production PHI
- **Convenience** - BTG is for emergencies only

---

## Security Requirements

### Multi-Layer Security

BTG access requires ALL of the following:

1. **JWT Authentication** - Valid, non-expired JWT token
2. **ADMIN Role** - Only users with ADMIN role can grant or receive BTG access
3. **MFA Verification** - Session must be MFA-authenticated (checked via JWT `amr` claim)
4. **IP Whitelist** - Access from approved IP addresses only (recommended)
5. **Justification** - Detailed business justification (minimum 25 characters)
6. **Time-Bound** - Access automatically expires after specified duration

### Grant Duration Options

Predefined durations (in minutes):
- **30 minutes** - Minimal emergency investigation
- **60 minutes** - Standard emergency response (1 hour)
- **120 minutes** - Extended investigation (2 hours)
- **240 minutes** - Complex multi-stage investigation (4 hours)
- **480 minutes** - Maximum duration for ongoing incidents (8 hours)

**Important**: Grants cannot be extended. If more time is needed, create a new grant with new justification.

---

## API Endpoints

All BTG endpoints are under `/api/admin/btg` and require JWT + ADMIN role.

### 1. Create BTG Grant

**Endpoint**: `POST /api/admin/btg/grants`

**Purpose**: Grant emergency access to a user for a specific patient

**Request Body**:
```json
{
  "grantedToUserId": "uuid-of-recipient-admin",
  "patientId": "uuid-of-patient",
  "justification": "Detailed reason (min 25 chars, max 500)",
  "durationMinutes": 120
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "grantId": "grant-uuid",
  "expiresAt": "2025-11-25T22:30:00Z",
  "message": "Emergency access granted for 120 minutes"
}
```

**Error Responses**:
- `400` - Invalid input (missing fields, invalid duration, justification too short)
- `403` - Insufficient permissions (not ADMIN, not MFA-authenticated)
- `404` - User or patient not found

**Example**:
```bash
curl -X POST https://api.omnirapeutic.com/api/admin/btg/grants \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "grantedToUserId": "aeb9e52f-b2bd-4ab2-b02f-0d68ae36b9ea",
    "patientId": "patient-uuid-here",
    "justification": "Emergency database investigation - patient data corruption reported by clinical staff, requires immediate ADMIN review to verify data integrity and prevent care disruption",
    "durationMinutes": 120
  }'
```

### 2. Revoke BTG Grant

**Endpoint**: `POST /api/admin/btg/grants/:grantId/revoke`

**Purpose**: Manually revoke a grant before it expires

**Request Body**:
```json
{
  "reason": "Reason for revocation (min 10 chars)"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Emergency access revoked successfully"
}
```

**Example**:
```bash
curl -X POST https://api.omnirapeutic.com/api/admin/btg/grants/$GRANT_ID/revoke \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Investigation completed, access no longer needed"
  }'
```

### 3. List Active BTG Grants

**Endpoint**: `GET /api/admin/btg/grants?status=active`

**Purpose**: View all currently active BTG grants

**Response** (200 OK):
```json
{
  "grants": [
    {
      "id": "grant-uuid",
      "grantedByUserId": "admin1-uuid",
      "grantedToUserId": "admin2-uuid",
      "patientId": "patient-uuid",
      "justification": "Emergency investigation...",
      "durationMinutes": 120,
      "expiresAt": "2025-11-25T22:30:00Z",
      "createdAt": "2025-11-25T20:30:00Z",
      "grantedByUser": { "email": "admin1@omnirapeutic.com" },
      "grantedToUser": { "email": "admin2@omnirapeutic.com" },
      "patient": {
        "firstName": "John",
        "lastName": "Doe",
        "medicalRecordNumber": "MRN123456"
      }
    }
  ],
  "count": 1
}
```

### 4. Get BTG Configuration

**Endpoint**: `GET /api/admin/btg/config`

**Purpose**: Get allowed durations and validation rules

**Response** (200 OK):
```json
{
  "allowedDurations": [30, 60, 120, 240, 480],
  "justificationMinLength": 25,
  "justificationMaxLength": 500
}
```

---

## Operational Procedures

### Standard BTG Grant Procedure

1. **Verify Emergency**
   - Confirm the situation requires BTG access
   - Ensure no alternative access method exists
   - Document the emergency in incident management system

2. **Prepare Justification**
   - Write a detailed justification (minimum 25 characters)
   - Include: What happened, why BTG is needed, expected investigation scope
   - Example: "Production database error affecting patient MRN123456. System logs show data corruption in allergies table. Need ADMIN access to investigate data integrity and prevent clinical errors."

3. **Create Grant**
   - Use the POST `/api/admin/btg/grants` endpoint
   - Select appropriate duration (use shortest possible)
   - Record grant ID for tracking

4. **Perform Investigation**
   - Access patient records only as needed
   - Document all actions taken
   - Minimize PHI exposure

5. **Complete and Revoke**
   - When investigation is complete, immediately revoke the grant
   - Use POST `/api/admin/btg/grants/:grantId/revoke`
   - Update incident management system with findings

6. **Post-Incident Review**
   - Review CloudWatch alerts and audit logs
   - Document lessons learned
   - Update procedures if needed

### Grant Expiration

Grants automatically expire after the specified duration. No action is required, but best practice is to manually revoke when done.

**Expired grants**:
- Cannot be used for access (authorization fails)
- Remain in database for audit purposes
- Are cleaned up after 30 days by maintenance job

---

## Audit and Monitoring

### Comprehensive Audit Trail

Every BTG operation is logged to:

1. **PostgreSQL Audit Log** (Immutable)
   - Table: `audit_logs`
   - Actions: `BTG_GRANT_ACCESS`, `BTG_REVOKE_ACCESS`, `BTG_USE_ACCESS`, `BTG_GRANT_ACCESS_FAILURE`
   - Includes: User ID, timestamp, IP address, detailed context

2. **CloudWatch Logs** (Structured JSON)
   - Log Group: `/aws/ecs/omnirapeutic-{environment}-api`
   - Parsed by metric filters for alerting
   - Searchable by action, user, patient, grant ID

### CloudWatch Alerts

Two automatic alerts are configured:

#### 1. BTG Grant Creation Alert (CRITICAL)

**Trigger**: ANY BTG grant creation
**Severity**: CRITICAL
**Notification**: SNS → Email to security team
**Response SLA**: Immediate review required

**Alert Message**:
> CRITICAL: Break-the-Glass emergency access granted. Immediate review required for HIPAA compliance.

**Action Required**:
- Verify grant was authorized
- Confirm justification is valid
- Monitor for grant usage
- Prepare for compliance review

#### 2. BTG Usage Alert (HIGH)

**Trigger**: ANY time a BTG grant is used to access patient records
**Severity**: HIGH
**Notification**: SNS → Email to security team

**Alert Message**:
> HIGH: Break-the-Glass emergency access is being used to access patient records.

**Action Required**:
- Monitor audit logs for accessed records
- Verify access aligns with justification
- Ensure PHI minimization practices

### Audit Log Queries

#### Query all BTG grants in last 24 hours
```sql
SELECT
  al.timestamp,
  al.user_id,
  u.email,
  al.action,
  al.details->>'patientMRN' as patient_mrn,
  al.details->>'justification' as justification,
  al.ip_address
FROM audit_logs al
JOIN users u ON u.id = al.user_id
WHERE al.action IN ('BTG_GRANT_ACCESS', 'BTG_REVOKE_ACCESS', 'BTG_USE_ACCESS')
  AND al.timestamp > NOW() - INTERVAL '24 hours'
ORDER BY al.timestamp DESC;
```

#### Query active BTG grants
```sql
SELECT
  bg.id,
  bg.created_at,
  bg.expires_at,
  u1.email as granted_by,
  u2.email as granted_to,
  p.medical_record_number,
  bg.justification,
  bg.duration_minutes
FROM btg_access_grants bg
JOIN users u1 ON u1.id = bg.granted_by_user_id
JOIN users u2 ON u2.id = bg.granted_to_user_id
JOIN patients p ON p.id = bg.patient_id
WHERE bg.expires_at > NOW()
  AND bg.revoked_at IS NULL
ORDER BY bg.created_at DESC;
```

#### Query BTG usage patterns
```sql
SELECT
  DATE(al.timestamp) as date,
  COUNT(*) as grant_count,
  COUNT(DISTINCT al.user_id) as unique_admins,
  COUNT(DISTINCT al.details->>'patientId') as unique_patients
FROM audit_logs al
WHERE al.action = 'BTG_GRANT_ACCESS'
  AND al.timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(al.timestamp)
ORDER BY date DESC;
```

---

## Emergency Response Runbook

### Scenario 1: Unauthorized BTG Grant Alert

**Symptoms**: CloudWatch alert for BTG grant creation, but no known emergency

**Response Steps**:

1. **Immediate** (< 5 minutes)
   - Check the CloudWatch alert for grant details (user, patient, justification)
   - Query active grants: `GET /api/admin/btg/grants?status=active`
   - Contact the admin who created the grant

2. **If Unauthorized** (< 10 minutes)
   - Immediately revoke the grant: `POST /api/admin/btg/grants/:grantId/revoke`
   - Check audit logs for any usage: `action = 'BTG_USE_ACCESS'`
   - If PHI was accessed, initiate breach investigation
   - Disable the admin user account
   - Escalate to security team and legal counsel

3. **If Authorized but Undocumented**
   - Document the emergency retroactively in incident management
   - Remind admin of proper BTG procedures
   - Monitor grant usage

4. **Follow-Up** (< 24 hours)
   - Complete incident report
   - Review access logs
   - Update security policies if needed

### Scenario 2: Suspicious BTG Usage Patterns

**Symptoms**: Multiple BTG grants from same user, unusual patient access patterns

**Response Steps**:

1. **Investigation** (< 30 minutes)
   - Query BTG usage patterns (SQL above)
   - Review justifications for consistency
   - Check if grants were properly revoked
   - Verify patients accessed match justifications

2. **If Suspicious**
   - Contact admin for explanation
   - Review all accessed PHI
   - Escalate to HIPAA compliance officer
   - Consider temporary account suspension

3. **Documentation**
   - Document all findings
   - Update risk assessment
   - Provide training if needed

### Scenario 3: BTG Grant Expires During Active Investigation

**Symptoms**: Grant expires before investigation is complete

**Response Steps**:

1. **Create New Grant**
   - Use the same procedure as initial grant
   - Update justification to reference ongoing investigation
   - Include progress summary and remaining work
   - Use shortest duration necessary

2. **Document Continuity**
   - Reference original grant ID in new justification
   - Update incident management system
   - Explain why extension was needed

---

## Compliance and Retention

### HIPAA Compliance

BTG system satisfies HIPAA requirements:

- **§ 164.308(a)(4)(ii)(C)** - Emergency Access Procedure ✓
- **§ 164.312(a)(1)** - Unique User Identification ✓
- **§ 164.312(b)** - Audit Controls ✓
- **§ 164.312(d)** - Person or Entity Authentication ✓

### Data Retention

- **Audit Logs**: Retained for 7 years (HIPAA requirement)
- **BTG Grants**: Expired grants cleaned up after 30 days, but audit trail remains
- **CloudWatch Logs**: Retained for 90 days (configurable)

### Annual Review

BTG system must be reviewed annually:

- [ ] Review all BTG grants from past year
- [ ] Verify all grants were properly justified
- [ ] Analyze usage patterns for anomalies
- [ ] Update policies based on lessons learned
- [ ] Test CloudWatch alerts
- [ ] Verify audit log integrity

### Reporting

Monthly BTG usage report should include:
- Total number of grants created
- Average duration of grants
- Number of grants revoked early
- List of unique admins using BTG
- Most common justification categories
- Any compliance concerns

---

## Security Best Practices

### For Administrators

1. **Use BTG Sparingly**
   - Only when absolutely necessary
   - Prefer standard RBAC when possible
   - Document emergencies thoroughly

2. **Minimize PHI Exposure**
   - Access only necessary patient records
   - Copy/download PHI only if required
   - Delete temporary PHI copies immediately after use

3. **Secure Your Account**
   - Always use MFA
   - Use strong, unique passwords
   - Never share credentials
   - Log out after completing investigation

4. **Document Everything**
   - Detailed justifications
   - Actions taken during investigation
   - Findings and resolution
   - Post-incident reports

### For Security Team

1. **Monitor Alerts Actively**
   - Review all BTG alerts within 1 hour
   - Investigate any suspicious patterns
   - Follow up on incomplete documentation

2. **Regular Audits**
   - Weekly review of active grants
   - Monthly review of all BTG activity
   - Quarterly compliance assessment

3. **Training**
   - Annual BTG training for all admins
   - Incident response drills
   - Policy updates as needed

---

## Appendix

### Quick Reference Commands

```bash
# Get BTG configuration
curl https://api.omnirapeutic.com/api/admin/btg/config \
  -H "Authorization: Bearer $TOKEN"

# Create BTG grant
curl -X POST https://api.omnirapeutic.com/api/admin/btg/grants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @grant-request.json

# List active grants
curl https://api.omnirapeutic.com/api/admin/btg/grants?status=active \
  -H "Authorization: Bearer $TOKEN"

# Revoke grant
curl -X POST https://api.omnirapeutic.com/api/admin/btg/grants/$GRANT_ID/revoke \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Investigation complete"}'
```

### Contact Information

- **Security Team**: security@omnirapeutic.com
- **HIPAA Compliance Officer**: compliance@omnirapeutic.com
- **Emergency Hotline**: [To be configured]
- **On-Call Rotation**: [PagerDuty/Opsgenie]

### Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-25 | 1.0 | Initial documentation | System |

---

**Document Classification**: INTERNAL - SECURITY SENSITIVE
**Last Updated**: 2025-11-25
**Next Review**: 2026-11-25
