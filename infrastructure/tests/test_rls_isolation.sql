-- Test: RLS Isolation Between Organizations
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- This test verifies that Row Level Security policies prevent
-- cross-organization data access

BEGIN;

\echo '=== Testing RLS Isolation ==='
\echo ''

-- Create two test organizations
INSERT INTO organizations (name, tax_id) VALUES
  ('Test Org A', 'TAX-001'),
  ('Test Org B', 'TAX-002')
RETURNING id, name;

-- Store IDs for reference
\gset org_a_ 1
\gset org_b_ 2

-- Create a user in each organization
INSERT INTO users (organization_id, email, password_hash, full_name, role)
SELECT id, 'admin-a@test.com', 'hash', 'Admin A', 'ADMIN'
FROM organizations WHERE name = 'Test Org A';

INSERT INTO users (organization_id, email, password_hash, full_name, role)
SELECT id, 'admin-b@test.com', 'hash', 'Admin B', 'ADMIN'
FROM organizations WHERE name = 'Test Org B';

-- Create patients in each organization
INSERT INTO patients (organization_id, first_name, last_name, date_of_birth, state)
SELECT id, 'Patient', 'A1', '2015-01-01', 'TX'
FROM organizations WHERE name = 'Test Org A';

INSERT INTO patients (organization_id, first_name, last_name, date_of_birth, state)
SELECT id, 'Patient', 'B1', '2015-01-01', 'CA'
FROM organizations WHERE name = 'Test Org B';

\echo 'Test data created'
\echo ''

-- Test 1: Set context to Org A and try to query patients
\echo 'Test 1: Setting context to Org A...'
SELECT id FROM organizations WHERE name = 'Test Org A' \gset org_a_
SET app.current_org_id = :'org_a_id';

\echo 'Querying patients from Org A context...'
SELECT count(*) as org_a_patients, first_name, last_name
FROM patients
GROUP BY first_name, last_name;
-- Expected: Should see only Patient A1

\echo ''
\echo 'Test 2: Switch context to Org B...'
SELECT id FROM organizations WHERE name = 'Test Org B' \gset org_b_
SET app.current_org_id = :'org_b_id';

\echo 'Querying patients from Org B context...'
SELECT count(*) as org_b_patients, first_name, last_name
FROM patients
GROUP BY first_name, last_name;
-- Expected: Should see only Patient B1

\echo ''
\echo 'Test 3: Reset context and verify no access...'
RESET app.current_org_id;

\echo 'Querying patients with no org context...'
SELECT count(*) as patients_no_context FROM patients;
-- Expected: 0 rows (no organization context set)

\echo ''
\echo 'Test 4: Verify cross-organization INSERT prevention...'
SELECT id FROM organizations WHERE name = 'Test Org A' \gset org_a_
SELECT id FROM organizations WHERE name = 'Test Org B' \gset org_b_
SET app.current_org_id = :'org_a_id';

\echo 'Attempting to insert patient into Org B while in Org A context...'
-- This should fail or the inserted row should not be visible
INSERT INTO patients (organization_id, first_name, last_name, date_of_birth, state)
VALUES (:'org_b_id', 'Hacker', 'Patient', '2015-01-01', 'TX');

\echo 'Checking if cross-org patient is visible...'
SET app.current_org_id = :'org_b_id';
SELECT count(*) as org_b_patients FROM patients WHERE last_name = 'Hacker';
-- Expected: 0 (should not see cross-org inserted patient)

\echo ''
\echo '=== RLS Isolation Test Complete ==='
\echo 'If all tests passed, RLS is working correctly'

ROLLBACK;
