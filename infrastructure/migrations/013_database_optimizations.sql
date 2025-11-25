-- Migration 013: Database Optimizations & Hardening
-- Sprint 5 - Database Performance & Security
-- Date: 2025-11-24
-- CRITICAL: Performance indexes, constraints, RLS strengthening

-- =====================================================
-- PART 1: Performance Optimization - Cleanup Function Index
-- =====================================================

-- Issue: cleanup_stale_reservations() performs full table scan
-- Fix: Add partial index on sessions table for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_stale_cleanup
ON sessions (created_at)
WHERE status IN ('SCHEDULED', 'IN_PROGRESS')
  AND authorization_id IS NOT NULL
  AND expected_units > 0;

COMMENT ON INDEX idx_sessions_stale_cleanup IS
'Optimizes cleanup_stale_reservations() function by indexing stale session lookup';

-- =====================================================
-- PART 2: Data Integrity - Prevent Negative Units
-- =====================================================

-- Issue: adjust_authorization_units() could set used_units negative
-- Fix: Add CHECK constraint at database level
ALTER TABLE authorizations
ADD CONSTRAINT IF NOT EXISTS check_used_units_non_negative
CHECK (used_units >= 0);

COMMENT ON CONSTRAINT check_used_units_non_negative ON authorizations IS
'Prevents used_units from becoming negative through adjustments or bugs';

-- Also ensure total_units is positive
ALTER TABLE authorizations
ADD CONSTRAINT IF NOT EXISTS check_total_units_positive
CHECK (total_units > 0);

-- =====================================================
-- PART 3: Optimize Cleanup Function - Fix N+1 Query
-- =====================================================

-- Enhanced cleanup function with organization_id fetched in main query
CREATE OR REPLACE FUNCTION app.cleanup_stale_reservations(
  p_stale_threshold_minutes integer DEFAULT 60
) RETURNS jsonb AS $$
DECLARE
  v_stale_session record;
  v_cleanup_count integer := 0;
  v_total_units_recovered integer := 0;
  v_cutoff_time timestamptz;
BEGIN
  v_cutoff_time := now() - (p_stale_threshold_minutes || ' minutes')::interval;

  -- OPTIMIZED: Join patients table to fetch organization_id once
  FOR v_stale_session IN
    SELECT
      s.id as session_id,
      s.authorization_id,
      s.expected_units,
      s.created_at,
      s.status,
      p.organization_id  -- Fetch org_id in main query (no N+1)
    FROM sessions s
    JOIN authorizations a ON s.authorization_id = a.id
    JOIN patients p ON a.patient_id = p.id
    WHERE s.created_at < v_cutoff_time
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND s.authorization_id IS NOT NULL
      AND s.expected_units > 0
  LOOP
    -- Release the reserved units back to authorization
    UPDATE authorizations
    SET used_units = GREATEST(0, used_units - v_stale_session.expected_units),
        updated_at = now(),
        status = CASE
          WHEN used_units - v_stale_session.expected_units < total_units THEN 'ACTIVE'
          ELSE status
        END
    WHERE id = v_stale_session.authorization_id;

    -- Mark session as cancelled
    UPDATE sessions
    SET status = 'CANCELLED',
        notes = COALESCE(notes || E'\n\n', '') ||
                format('Auto-cancelled due to stale reservation (created %s, cleaned up %s)',
                       v_stale_session.created_at, now()),
        updated_at = now()
    WHERE id = v_stale_session.session_id;

    -- Audit the cleanup (use pre-fetched organization_id)
    INSERT INTO audit_logs (
      organization_id,
      user_id,
      action,
      resource_type,
      resource_id,
      details
    ) VALUES (
      v_stale_session.organization_id,  -- No subquery needed!
      NULL, -- System action, no user
      'CLEANUP_STALE_RESERVATION',
      'session',
      v_stale_session.session_id,
      jsonb_build_object(
        'authorization_id', v_stale_session.authorization_id,
        'units_recovered', v_stale_session.expected_units,
        'session_age_minutes', EXTRACT(EPOCH FROM (now() - v_stale_session.created_at)) / 60,
        'original_status', v_stale_session.status
      )
    );

    v_cleanup_count := v_cleanup_count + 1;
    v_total_units_recovered := v_total_units_recovered + v_stale_session.expected_units;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sessions_cleaned', v_cleanup_count,
    'total_units_recovered', v_total_units_recovered,
    'stale_threshold_minutes', p_stale_threshold_minutes,
    'cutoff_time', v_cutoff_time
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 4: Enhanced adjust_authorization_units with Validation
-- =====================================================

-- Add validation to prevent negative used_units
CREATE OR REPLACE FUNCTION app.adjust_authorization_units(
  p_authorization_id uuid,
  p_adjustment integer
) RETURNS jsonb AS $$
DECLARE
  v_current_org_id uuid;
  v_auth_org_id uuid;
  v_current_used_units integer;
BEGIN
  -- SECURITY: Get the calling user's organization
  v_current_org_id := app.current_organization_id();

  IF v_current_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'No organization context for current user'
    );
  END IF;

  -- Verify the authorization belongs to caller's organization and get current used_units
  SELECT p.organization_id, a.used_units
  INTO v_auth_org_id, v_current_used_units
  FROM authorizations a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.id = p_authorization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_NOT_FOUND',
      'message', 'Authorization not found'
    );
  END IF;

  -- CRITICAL SECURITY CHECK
  IF v_auth_org_id != v_current_org_id THEN
    INSERT INTO audit_logs (
      organization_id,
      user_id,
      action,
      resource_type,
      resource_id,
      details
    ) VALUES (
      v_current_org_id,
      app.current_user_id(),
      'UNAUTHORIZED_AUTHORIZATION_ADJUSTMENT',
      'authorization',
      p_authorization_id,
      jsonb_build_object(
        'attempted_adjustment', p_adjustment,
        'attempted_org', v_auth_org_id,
        'caller_org', v_current_org_id
      )
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'User is not authorized to adjust units for this authorization'
    );
  END IF;

  -- NEW: Prevent adjustment that would result in negative used_units
  IF v_current_used_units + p_adjustment < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_ADJUSTMENT',
      'message', format('Adjustment of %s would result in negative used units (current: %s)',
                       p_adjustment, v_current_used_units),
      'current_used_units', v_current_used_units,
      'requested_adjustment', p_adjustment
    );
  END IF;

  -- Perform the adjustment
  UPDATE authorizations
  SET used_units = used_units + p_adjustment,
      updated_at = now(),
      status = CASE
        WHEN (used_units + p_adjustment) >= total_units THEN 'EXHAUSTED'
        WHEN (used_units + p_adjustment) < total_units AND status = 'EXHAUSTED' THEN 'ACTIVE'
        ELSE status
      END
  WHERE id = p_authorization_id;

  -- Audit the adjustment
  INSERT INTO audit_logs (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    v_current_org_id,
    app.current_user_id(),
    'ADJUST_AUTHORIZATION_UNITS',
    'authorization',
    p_authorization_id,
    jsonb_build_object(
      'adjustment', p_adjustment,
      'previous_used_units', v_current_used_units,
      'new_used_units', v_current_used_units + p_adjustment
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'adjustment', p_adjustment,
    'authorization_id', p_authorization_id,
    'previous_used_units', v_current_used_units,
    'new_used_units', v_current_used_units + p_adjustment
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 5: Strengthen RLS Policies for Audit Logs
-- =====================================================

-- Drop existing policies that allow UPDATE/DELETE
DROP POLICY IF EXISTS audit_no_update ON audit_logs;
DROP POLICY IF EXISTS audit_no_delete ON audit_logs;

-- Recreate with explicit USING (false) for UPDATE/DELETE
CREATE POLICY audit_no_update ON audit_logs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY audit_no_delete ON audit_logs
  FOR DELETE
  USING (false);

-- Verify audit_logs is truly immutable by revoking UPDATE/DELETE at table level
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;

-- Grant only INSERT and SELECT
GRANT INSERT, SELECT ON audit_logs TO authenticated;

COMMENT ON TABLE audit_logs IS
'Immutable audit trail for HIPAA compliance. UPDATE and DELETE operations are explicitly denied.';

-- =====================================================
-- PART 6: Function Permission Cleanup
-- =====================================================

-- Revoke PUBLIC access to maintenance function
REVOKE EXECUTE ON FUNCTION app.cleanup_stale_reservations(integer) FROM PUBLIC;

-- Grant to postgres role only (will be executed by scheduled job)
GRANT EXECUTE ON FUNCTION app.cleanup_stale_reservations(integer) TO postgres;

COMMENT ON FUNCTION app.cleanup_stale_reservations(integer) IS
'Maintenance function to cleanup stale authorization reservations. Should be executed by scheduled job only.';

-- Ensure other functions remain accessible to authenticated users
GRANT EXECUTE ON FUNCTION app.reserve_session_units(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app.adjust_authorization_units(uuid, integer) TO authenticated;

-- =====================================================
-- PART 7: Additional Performance Indexes
-- =====================================================

-- Index for authorization unit queries (patient lookup)
CREATE INDEX IF NOT EXISTS idx_authorizations_patient_status
ON authorizations (patient_id, status, end_date)
WHERE status IN ('ACTIVE', 'PENDING');

COMMENT ON INDEX idx_authorizations_patient_status IS
'Optimizes active authorization lookup by patient';

-- Index for session queries by patient
CREATE INDEX IF NOT EXISTS idx_sessions_patient_date
ON sessions (patient_id, start_time DESC);

COMMENT ON INDEX idx_sessions_patient_date IS
'Optimizes session history queries for patient timelines';

-- Index for audit log queries (organization + time range)
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time
ON audit_logs (organization_id, timestamp DESC);

COMMENT ON INDEX idx_audit_logs_org_time IS
'Optimizes audit log queries by organization and time';

-- =====================================================
-- PART 8: Verification Queries
-- =====================================================

-- Output confirmation
SELECT '=== Migration 013: Database Optimizations Complete ===' AS status;
SELECT '';

SELECT 'Part 1: Performance Indexes' AS section;
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_sessions_stale%'
     OR indexname LIKE 'idx_authorizations_patient%'
     OR indexname LIKE 'idx_sessions_patient%'
     OR indexname LIKE 'idx_audit_logs_org%'
ORDER BY indexname;

SELECT '';
SELECT 'Part 2: Data Integrity Constraints' AS section;
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'authorizations'::regclass
  AND conname LIKE 'check_%'
ORDER BY conname;

SELECT '';
SELECT 'Part 3: Function Optimizations' AS section;
SELECT
  routine_name,
  routine_type,
  security_type,
  specific_name
FROM information_schema.routines
WHERE routine_schema = 'app'
  AND routine_name IN ('cleanup_stale_reservations', 'adjust_authorization_units')
ORDER BY routine_name;

SELECT '';
SELECT 'Part 4: RLS Policy Status' AS section;
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'audit_logs'
ORDER BY policyname;

SELECT '';
SELECT 'Part 5: Audit Logs Permissions' AS section;
SELECT
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'audit_logs'
ORDER BY grantee, privilege_type;

SELECT '';
SELECT '=== Migration 013 Summary ===' AS status;
SELECT '4 performance indexes created' AS optimization_1;
SELECT '2 CHECK constraints added (used_units >= 0, total_units > 0)' AS optimization_2;
SELECT 'cleanup_stale_reservations() optimized (N+1 query fix)' AS optimization_3;
SELECT 'adjust_authorization_units() enhanced with negative prevention' AS optimization_4;
SELECT 'audit_logs RLS policies strengthened (true immutability)' AS optimization_5;
SELECT 'Function permissions tightened (PUBLIC revoked)' AS optimization_6;
SELECT '';
SELECT '=== All Optimizations Applied Successfully ===' AS final_status;
