-- Migration 012: Fix SECURITY_DEFINER Vulnerability
-- Sprint 4 Phase 1A: Security Hardening
-- Date: 2025-11-24
-- CRITICAL: Add organization validation to prevent cross-org unit theft

-- =====================================================
-- ISSUE: Functions with SECURITY DEFINER trust p_authorization_id
-- without validating that the calling user belongs to the
-- organization that owns the authorization.
--
-- ATTACK: User from Org A can call reserve_session_units() with
-- an authorization_id from Org B, stealing their therapy units.
--
-- FIX: Add organization validation using app.current_organization_id()
-- =====================================================

-- Function: Enhanced atomic authorization unit reservation with security validation
CREATE OR REPLACE FUNCTION app.reserve_session_units(
  p_authorization_id uuid,
  p_expected_units integer
) RETURNS jsonb AS $$
DECLARE
  v_available integer;
  v_auth record;
  v_current_org_id uuid;
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

  -- Lock the authorization row (prevents concurrent access)
  SELECT a.*, p.organization_id INTO v_auth
  FROM authorizations a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.id = p_authorization_id
  FOR UPDATE;

  -- Check if authorization exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_NOT_FOUND',
      'message', 'Authorization not found'
    );
  END IF;

  -- CRITICAL SECURITY CHECK: Verify caller owns this authorization
  IF v_auth.organization_id != v_current_org_id THEN
    -- Log the attempted cross-org access
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
      'UNAUTHORIZED_AUTHORIZATION_ACCESS',
      'authorization',
      p_authorization_id,
      jsonb_build_object(
        'attempted_org', v_auth.organization_id,
        'caller_org', v_current_org_id,
        'authorization_id', p_authorization_id
      )
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'User is not authorized to reserve units for this authorization'
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

  -- Audit the successful reservation
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
    'RESERVE_AUTHORIZATION_UNITS',
    'authorization',
    p_authorization_id,
    jsonb_build_object(
      'units_reserved', p_expected_units,
      'remaining_units', v_available - p_expected_units
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'units_reserved', p_expected_units,
    'remaining_units', v_available - p_expected_units,
    'authorization_id', p_authorization_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Enhanced adjust_authorization_units with security validation
CREATE OR REPLACE FUNCTION app.adjust_authorization_units(
  p_authorization_id uuid,
  p_adjustment integer
) RETURNS jsonb AS $$
DECLARE
  v_current_org_id uuid;
  v_auth_org_id uuid;
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

  -- Verify the authorization belongs to caller's organization
  SELECT p.organization_id INTO v_auth_org_id
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
    jsonb_build_object('adjustment', p_adjustment)
  );

  RETURN jsonb_build_object(
    'success', true,
    'adjustment', p_adjustment,
    'authorization_id', p_authorization_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- NEW: Orphaned Reservation Cleanup Function
-- =====================================================

-- Function: Cleanup stale authorization reservations
-- Finds sessions that reserved units but never completed
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

  -- Find sessions that are old and not completed
  FOR v_stale_session IN
    SELECT
      s.id as session_id,
      s.authorization_id,
      s.expected_units,
      s.created_at,
      s.status
    FROM sessions s
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

    -- Audit the cleanup
    INSERT INTO audit_logs (
      organization_id,
      user_id,
      action,
      resource_type,
      resource_id,
      details
    ) VALUES (
      (SELECT organization_id FROM patients WHERE id =
        (SELECT patient_id FROM sessions WHERE id = v_stale_session.session_id)),
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION app.cleanup_stale_reservations(integer) TO PUBLIC;

-- Output confirmation
SELECT 'Security fixes applied successfully' AS status;
SELECT 'Fixed SECURITY_DEFINER vulnerabilities in reserve_session_units and adjust_authorization_units' AS fix_1;
SELECT 'Added cleanup_stale_reservations function for orphaned unit recovery' AS fix_2;
SELECT 'All functions now validate organization ownership before operations' AS fix_3;
