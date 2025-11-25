-- Migration 011: Row Level Security (RLS) Policies and Helper Functions
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24
-- CRITICAL: Multi-tenant isolation and security

-- =====================================================
-- PART 1: Helper Functions (in app schema)
-- =====================================================

-- Function: Get current user ID from session variable
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid AS $$
BEGIN
  RETURN current_setting('app.current_user_id', true)::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Get current organization ID
-- Tries session variable first, then falls back to user lookup
CREATE OR REPLACE FUNCTION app.current_organization_id() RETURNS uuid AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Try to get from session variable first (most efficient)
  BEGIN
    v_org_id := current_setting('app.current_org_id', true)::uuid;
    IF v_org_id IS NOT NULL THEN
      RETURN v_org_id;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;

  -- Fall back to looking up user's organization
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = app.current_user_id();

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- PART 2: Authorization Business Logic Functions
-- =====================================================

-- Function: Atomic authorization unit reservation
-- CRITICAL: Prevents race conditions using row-level locking
CREATE OR REPLACE FUNCTION app.reserve_session_units(
  p_authorization_id uuid,
  p_expected_units integer
) RETURNS jsonb AS $$
DECLARE
  v_available integer;
  v_auth record;
BEGIN
  -- Lock the authorization row (prevents concurrent access)
  SELECT * INTO v_auth
  FROM authorizations
  WHERE id = p_authorization_id
  FOR UPDATE;

  -- Check if authorization exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_NOT_FOUND',
      'message', 'Authorization not found'
    );
  END IF;

  -- Check expiration
  IF v_auth.end_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_EXPIRED',
      'message', format('Authorization expired on %s', v_auth.end_date),
      'expired_date', v_auth.end_date
    );
  END IF;

  -- Check if already exhausted
  IF v_auth.status = 'EXHAUSTED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_EXHAUSTED',
      'message', 'Authorization has no remaining units'
    );
  END IF;

  -- Calculate available units
  v_available := v_auth.total_units - v_auth.used_units;

  IF v_available < p_expected_units THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_UNITS',
      'message', format('Only %s units available, need %s', v_available, p_expected_units),
      'available', v_available,
      'requested', p_expected_units
    );
  END IF;

  -- Reserve units immediately (atomic operation)
  UPDATE authorizations
  SET used_units = used_units + p_expected_units,
      updated_at = now(),
      status = CASE
        WHEN (used_units + p_expected_units) >= total_units THEN 'EXHAUSTED'
        ELSE status
      END
  WHERE id = p_authorization_id;

  RETURN jsonb_build_object(
    'success', true,
    'units_reserved', p_expected_units,
    'remaining_units', v_available - p_expected_units,
    'authorization_id', p_authorization_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Adjust authorization units after session completes
-- Used to correct unit count if session duration differs from estimate
CREATE OR REPLACE FUNCTION app.adjust_authorization_units(
  p_authorization_id uuid,
  p_adjustment integer
) RETURNS void AS $$
BEGIN
  UPDATE authorizations
  SET used_units = used_units + p_adjustment,
      updated_at = now(),
      status = CASE
        WHEN (used_units + p_adjustment) >= total_units THEN 'EXHAUSTED'
        WHEN (used_units + p_adjustment) < total_units AND status = 'EXHAUSTED' THEN 'ACTIVE'
        ELSE status
      END
  WHERE id = p_authorization_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Check for scheduling conflicts
-- Returns true if conflict exists
CREATE OR REPLACE FUNCTION app.check_scheduling_conflict(
  p_provider_id uuid,
  p_patient_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_appointment_id uuid DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM appointments
    WHERE status IN ('SCHEDULED', 'IN_PROGRESS')
    AND (provider_id = p_provider_id OR patient_id = p_patient_id)
    AND tsrange(start_time, end_time) && tsrange(p_start, p_end)
    AND (p_exclude_appointment_id IS NULL OR id != p_exclude_appointment_id)
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 3: Enable RLS on All Tables
-- =====================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 4: RLS Policies for Multi-Tenant Isolation
-- =====================================================

-- Organizations: Users can only access their own organization
CREATE POLICY org_isolation ON organizations
  FOR ALL USING (id = app.current_organization_id());

-- Users: Organization isolation
CREATE POLICY org_isolation ON users
  FOR ALL USING (organization_id = app.current_organization_id());

-- Staff Members: Organization isolation
CREATE POLICY org_isolation ON staff_members
  FOR ALL USING (organization_id = app.current_organization_id());

-- Patients: Organization isolation
CREATE POLICY org_isolation ON patients
  FOR ALL USING (organization_id = app.current_organization_id());

-- Patient Insurance: Via patient relationship
CREATE POLICY org_isolation ON patient_insurance
  FOR ALL USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = app.current_organization_id()
    )
  );

-- Authorizations: Via patient relationship
CREATE POLICY org_isolation ON authorizations
  FOR ALL USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = app.current_organization_id()
    )
  );

-- Appointments: Organization isolation
CREATE POLICY org_isolation ON appointments
  FOR ALL USING (organization_id = app.current_organization_id());

-- Sessions: Via patient relationship
CREATE POLICY org_isolation ON sessions
  FOR ALL USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = app.current_organization_id()
    )
  );

-- Session Events: Via session relationship
CREATE POLICY org_isolation ON session_events
  FOR ALL USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE patient_id IN (
        SELECT id FROM patients WHERE organization_id = app.current_organization_id()
      )
    )
  );

-- Claims: Via session relationship
CREATE POLICY org_isolation ON claims
  FOR ALL USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE patient_id IN (
        SELECT id FROM patients WHERE organization_id = app.current_organization_id()
      )
    )
  );

-- Audit Logs: Organization isolation (read-only)
-- Users can read audit logs from their organization but cannot modify
CREATE POLICY org_read_only ON audit_logs
  FOR SELECT USING (organization_id = app.current_organization_id());

-- Audit logs: Allow INSERT for logging (no UPDATE/DELETE)
CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (organization_id = app.current_organization_id());

-- Explicitly deny UPDATE and DELETE on audit_logs (immutability)
CREATE POLICY audit_no_update ON audit_logs
  FOR UPDATE USING (false);

CREATE POLICY audit_no_delete ON audit_logs
  FOR DELETE USING (false);

-- =====================================================
-- PART 5: Grant Permissions
-- =====================================================

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION app.current_user_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_session_units(uuid, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.adjust_authorization_units(uuid, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.check_scheduling_conflict(uuid, uuid, timestamptz, timestamptz, uuid) TO PUBLIC;

-- Output confirmation
SELECT 'RLS policies and helper functions created successfully' AS status;
SELECT 'Total RLS policies: ' || count(*)::text FROM pg_policies WHERE schemaname = 'public';
SELECT 'Total app functions: ' || count(*)::text FROM pg_proc WHERE pronamespace = 'app'::regnamespace;
