-- Migration: Create database functions
-- Description: Helper functions, atomic authorization operations, and conflict prevention
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- =============================================================================
-- RLS HELPER FUNCTION
-- =============================================================================

-- Function: Get user's organization ID for RLS policies
CREATE OR REPLACE FUNCTION auth.user_organization_id() RETURNS uuid AS $$
  SELECT organization_id FROM providers WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION auth.user_organization_id IS 'Returns organization_id for current authenticated user (used in RLS policies)';

-- =============================================================================
-- ATOMIC AUTHORIZATION RESERVE FUNCTION (CRITICAL FOR RACE CONDITION PREVENTION)
-- =============================================================================

CREATE OR REPLACE FUNCTION reserve_session_units(
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
      'message', format('Authorization expired on %s', v_auth.end_date)
    );
  END IF;

  -- Calculate available units
  v_available := v_auth.total_units - v_auth.used_units;

  IF v_available < p_expected_units THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_UNITS',
      'message', format('Only %s units available, need %s', v_available, p_expected_units),
      'available', v_available
    );
  END IF;

  -- Reserve units immediately (atomic operation)
  UPDATE authorizations
  SET used_units = used_units + p_expected_units,
      updated_at = now()
  WHERE id = p_authorization_id;

  RETURN jsonb_build_object(
    'success', true,
    'units_reserved', p_expected_units,
    'remaining_units', v_available - p_expected_units
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reserve_session_units IS 'Atomically reserves units from authorization with FOR UPDATE locking (prevents race conditions)';

-- =============================================================================
-- AUTHORIZATION ADJUSTMENT FUNCTION
-- =============================================================================

-- Helper function to adjust units after session completes (if over/under estimated)
CREATE OR REPLACE FUNCTION adjust_authorization_units(
  p_authorization_id uuid,
  p_adjustment integer
) RETURNS void AS $$
BEGIN
  UPDATE authorizations
  SET used_units = used_units + p_adjustment,
      updated_at = now()
  WHERE id = p_authorization_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION adjust_authorization_units IS 'Adjusts authorization units after session completion (positive = increase used, negative = decrease used)';

-- =============================================================================
-- SCHEDULING CONFLICT PREVENTION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION check_scheduling_conflict(
  p_provider_id uuid,
  p_patient_id uuid,
  p_start timestamptz,
  p_end timestamptz
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM appointments
    WHERE status IN ('SCHEDULED', 'IN_PROGRESS')
    AND (provider_id = p_provider_id OR patient_id = p_patient_id)
    AND tsrange(start_time, end_time) && tsrange(p_start, p_end)
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_scheduling_conflict IS 'Checks if provider or patient has conflicting appointment (returns true if conflict exists)';

-- =============================================================================
-- AUTHORIZATION STATUS UPDATE TRIGGER
-- =============================================================================

-- Function to automatically update authorization status based on dates and units
CREATE OR REPLACE FUNCTION update_authorization_status() RETURNS trigger AS $$
BEGIN
  -- Check if expired
  IF NEW.end_date < CURRENT_DATE THEN
    NEW.status := 'EXPIRED';
  -- Check if exhausted
  ELSIF NEW.used_units >= NEW.total_units THEN
    NEW.status := 'EXHAUSTED';
  -- Otherwise active
  ELSIF NEW.start_date <= CURRENT_DATE AND NEW.end_date >= CURRENT_DATE THEN
    NEW.status := 'ACTIVE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update authorization status
CREATE TRIGGER trigger_update_authorization_status
  BEFORE INSERT OR UPDATE ON authorizations
  FOR EACH ROW
  EXECUTE FUNCTION update_authorization_status();

COMMENT ON FUNCTION update_authorization_status IS 'Automatically updates authorization status based on dates and unit consumption';

-- DOWN Migration (for rollback)
-- DROP TRIGGER IF EXISTS trigger_update_authorization_status ON authorizations;
-- DROP FUNCTION IF EXISTS update_authorization_status();
-- DROP FUNCTION IF EXISTS check_scheduling_conflict(uuid, uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS adjust_authorization_units(uuid, integer);
-- DROP FUNCTION IF EXISTS reserve_session_units(uuid, integer);
-- DROP FUNCTION IF EXISTS auth.user_organization_id();
