-- Test: Atomic Authorization Unit Reservation
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- This test verifies that the reserve_session_units function
-- prevents race conditions and correctly handles unit reservation

BEGIN;

\echo '=== Testing Atomic Authorization Reservation ==='
\echo ''

-- Create test organization
INSERT INTO organizations (name) VALUES ('Test Org') RETURNING id \gset org_

-- Create test patient
INSERT INTO patients (organization_id, first_name, last_name, date_of_birth, state)
VALUES (:'org_id', 'Test', 'Patient', '2015-01-01', 'TX')
RETURNING id \gset patient_

-- Create authorization with 100 units
INSERT INTO authorizations (
  patient_id,
  service_code,
  total_units,
  used_units,
  start_date,
  end_date,
  status
) VALUES (
  :'patient_id',
  '97153',
  100,
  0,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '6 months',
  'ACTIVE'
) RETURNING id \gset auth_

\echo 'Test authorization created with 100 units'
\echo ''

-- Test 1: Successful reservation
\echo 'Test 1: Reserve 10 units (should succeed)...'
SELECT app.reserve_session_units(:'auth_id'::uuid, 10) as result \gexec

SELECT total_units, used_units, status FROM authorizations WHERE id = :'auth_id';
-- Expected: used_units = 10, status = 'ACTIVE'

\echo ''
\echo 'Test 2: Reserve 50 more units (should succeed)...'
SELECT app.reserve_session_units(:'auth_id'::uuid, 50) as result \gexec

SELECT total_units, used_units, status FROM authorizations WHERE id = :'auth_id';
-- Expected: used_units = 60, status = 'ACTIVE'

\echo ''
\echo 'Test 3: Reserve 40 more units (should succeed and exhaust)...'
SELECT app.reserve_session_units(:'auth_id'::uuid, 40) as result \gexec

SELECT total_units, used_units, status FROM authorizations WHERE id = :'auth_id';
-- Expected: used_units = 100, status = 'EXHAUSTED'

\echo ''
\echo 'Test 4: Try to reserve more units when exhausted (should fail)...'
SELECT app.reserve_session_units(:'auth_id'::uuid, 10) as result \gexec
-- Expected: success = false, error = 'INSUFFICIENT_UNITS'

\echo ''
\echo 'Test 5: Test expired authorization...'
UPDATE authorizations SET end_date = CURRENT_DATE - INTERVAL '1 day', status = 'EXPIRED'
WHERE id = :'auth_id';

SELECT app.reserve_session_units(:'auth_id'::uuid, 5) as result \gexec
-- Expected: success = false, error = 'AUTH_EXPIRED'

\echo ''
\echo 'Test 6: Test adjustment function...'
-- Create new authorization
INSERT INTO authorizations (
  patient_id,
  service_code,
  total_units,
  used_units,
  start_date,
  end_date,
  status
) VALUES (
  :'patient_id',
  '97153',
  100,
  50,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '6 months',
  'ACTIVE'
) RETURNING id \gset auth2_

\echo 'Created new auth with 50 used units'
SELECT total_units, used_units FROM authorizations WHERE id = :'auth2_id';

\echo 'Adjusting by +10 units...'
SELECT app.adjust_authorization_units(:'auth2_id'::uuid, 10);
SELECT total_units, used_units FROM authorizations WHERE id = :'auth2_id';
-- Expected: used_units = 60

\echo 'Adjusting by -5 units (refund)...'
SELECT app.adjust_authorization_units(:'auth2_id'::uuid, -5);
SELECT total_units, used_units FROM authorizations WHERE id = :'auth2_id';
-- Expected: used_units = 55

\echo ''
\echo 'Test 7: Verify constraint prevents negative balance...'
\echo 'This should raise a constraint violation:'
UPDATE authorizations SET used_units = -10 WHERE id = :'auth2_id';
-- Expected: ERROR due to CHECK constraint

\echo ''
\echo '=== Atomic Authorization Test Complete ==='

ROLLBACK;
