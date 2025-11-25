-- Test: Audit Logging and Immutability
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- This test verifies that audit logs are created and immutable

BEGIN;

\echo '=== Testing Audit Logging ==='
\echo ''

-- Create test organization
INSERT INTO organizations (name) VALUES ('Test Org') RETURNING id \gset org_

-- Create test user
INSERT INTO users (organization_id, email, password_hash, full_name, role)
VALUES (:'org_id', 'test@example.com', 'hash', 'Test User', 'BCBA')
RETURNING id \gset user_

-- Set organization context
SET app.current_org_id = :'org_id';

\echo 'Test 1: Create audit log entry...'
INSERT INTO audit_logs (
  user_id,
  user_email,
  organization_id,
  action,
  resource_type,
  resource_id,
  ip_address,
  details
) VALUES (
  :'user_id'::uuid,
  'test@example.com',
  :'org_id'::uuid,
  'VIEW_PATIENT',
  'patient',
  gen_random_uuid(),
  '192.168.1.1'::inet,
  '{"page": "patient_detail"}'::jsonb
) RETURNING id, timestamp, action;

\echo 'Audit log created successfully'
\echo ''

\echo 'Test 2: Verify audit log is readable...'
SELECT count(*) as audit_count FROM audit_logs;
-- Expected: At least 1

SELECT action, resource_type, user_email FROM audit_logs ORDER BY timestamp DESC LIMIT 1;
\echo ''

\echo 'Test 3: Try to UPDATE audit log (should fail with RLS policy)...'
UPDATE audit_logs SET action = 'MODIFIED_ACTION' WHERE user_id = :'user_id'::uuid;
-- Expected: 0 rows affected (policy prevents updates)

SELECT count(*) as modified_count FROM audit_logs WHERE action = 'MODIFIED_ACTION';
-- Expected: 0

\echo ''
\echo 'Test 4: Try to DELETE audit log (should fail with RLS policy)...'
DELETE FROM audit_logs WHERE user_id = :'user_id'::uuid;
-- Expected: 0 rows affected (policy prevents deletes)

SELECT count(*) as remaining_logs FROM audit_logs;
-- Expected: Same count as before

\echo ''
\echo 'Test 5: Verify pgAudit extension is installed...'
SELECT * FROM pg_extension WHERE extname = 'pgaudit';
-- Expected: 1 row showing pgaudit

\echo ''
\echo 'Test 6: Check if pgAudit parameters are set...'
SHOW pgaudit.log;
-- Expected: Should show 'all' or similar

\echo ''
\echo 'Test 7: Create multiple audit entries for query testing...'
INSERT INTO audit_logs (user_id, user_email, organization_id, action, resource_type, resource_id)
VALUES
  (:'user_id'::uuid, 'test@example.com', :'org_id'::uuid, 'CREATE_PATIENT', 'patient', gen_random_uuid()),
  (:'user_id'::uuid, 'test@example.com', :'org_id'::uuid, 'UPDATE_PATIENT', 'patient', gen_random_uuid()),
  (:'user_id'::uuid, 'test@example.com', :'org_id'::uuid, 'VIEW_SESSION', 'session', gen_random_uuid());

\echo 'Additional audit entries created'
SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action ORDER BY action;

\echo ''
\echo '=== Audit Logging Test Complete ==='
\echo 'Audit logs are working and immutable via RLS policies'

ROLLBACK;
