-- Migration: Create Row Level Security (RLS) policies
-- Description: Multi-tenant data isolation policies (HIPAA critical)
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- =============================================================================
-- ORGANIZATIONS POLICIES
-- =============================================================================

-- Users can only view their own organization
CREATE POLICY org_isolation ON organizations
  FOR ALL
  USING (id = auth.user_organization_id());

COMMENT ON POLICY org_isolation ON organizations IS 'Users can only access their own organization';

-- =============================================================================
-- PROVIDERS POLICIES
-- =============================================================================

-- Users can only access providers in their organization
CREATE POLICY org_isolation ON providers
  FOR ALL
  USING (organization_id = auth.user_organization_id());

COMMENT ON POLICY org_isolation ON providers IS 'Providers can only access other providers in same organization';

-- =============================================================================
-- PATIENTS POLICIES (PHI - HIPAA CRITICAL)
-- =============================================================================

-- Users can only access patients in their organization
CREATE POLICY org_isolation ON patients
  FOR ALL
  USING (organization_id = auth.user_organization_id());

COMMENT ON POLICY org_isolation ON patients IS 'Patients isolated by organization (HIPAA compliance)';

-- =============================================================================
-- PATIENT_INSURANCE POLICIES (PHI)
-- =============================================================================

-- Insurance records inherit from patient
CREATE POLICY insurance_access ON patient_insurance
  FOR ALL
  USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = auth.user_organization_id()
    )
  );

COMMENT ON POLICY insurance_access ON patient_insurance IS 'Insurance records accessible only to users in patient organization';

-- =============================================================================
-- AUTHORIZATIONS POLICIES
-- =============================================================================

-- Authorizations inherit from patient
CREATE POLICY authorization_access ON authorizations
  FOR ALL
  USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = auth.user_organization_id()
    )
  );

COMMENT ON POLICY authorization_access ON authorizations IS 'Authorization records accessible only to users in patient organization';

-- =============================================================================
-- APPOINTMENTS POLICIES
-- =============================================================================

-- Appointments isolated by organization
CREATE POLICY org_isolation ON appointments
  FOR ALL
  USING (organization_id = auth.user_organization_id());

COMMENT ON POLICY org_isolation ON appointments IS 'Appointments isolated by organization';

-- =============================================================================
-- SESSIONS POLICIES (PHI - CONTAINS CLINICAL NOTES)
-- =============================================================================

-- Sessions inherit from patients
CREATE POLICY session_access ON sessions
  FOR ALL
  USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = auth.user_organization_id()
    )
  );

COMMENT ON POLICY session_access ON sessions IS 'Session records (clinical notes) accessible only to users in patient organization';

-- =============================================================================
-- SESSION_EVENTS POLICIES (CLINICAL DATA)
-- =============================================================================

-- Events inherit from sessions which inherit from patients
CREATE POLICY event_access ON session_events
  FOR ALL
  USING (
    session_id IN (
      SELECT s.id FROM sessions s
      JOIN patients p ON s.patient_id = p.id
      WHERE p.organization_id = auth.user_organization_id()
    )
  );

COMMENT ON POLICY event_access ON session_events IS 'Session events accessible only to users in patient organization';

-- =============================================================================
-- CLAIMS POLICIES (BILLING DATA)
-- =============================================================================

-- Claims inherit from sessions
CREATE POLICY claim_access ON claims
  FOR ALL
  USING (
    session_id IN (
      SELECT s.id FROM sessions s
      JOIN patients p ON s.patient_id = p.id
      WHERE p.organization_id = auth.user_organization_id()
    )
  );

COMMENT ON POLICY claim_access ON claims IS 'Claims accessible only to users in patient organization';

-- =============================================================================
-- AUDIT_LOGS POLICIES (READ-ONLY, IMMUTABLE)
-- =============================================================================

-- Users can read audit logs for their organization, but cannot modify
CREATE POLICY audit_read ON audit_logs
  FOR SELECT
  USING (organization_id = auth.user_organization_id());

-- Audit logs can only be inserted (no updates/deletes)
CREATE POLICY audit_insert ON audit_logs
  FOR INSERT
  WITH CHECK (organization_id = auth.user_organization_id());

COMMENT ON POLICY audit_read ON audit_logs IS 'Users can read audit logs for their organization';
COMMENT ON POLICY audit_insert ON audit_logs IS 'Audit logs can be inserted but never updated/deleted (HIPAA requirement)';

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================

-- To verify RLS is working correctly, run this query as a test user:
-- It should only return data from their organization

-- SELECT COUNT(*) FROM patients;  -- Should only show org's patients
-- SELECT COUNT(*) FROM sessions;  -- Should only show org's sessions
-- SELECT COUNT(*) FROM audit_logs; -- Should only show org's audit logs

-- DOWN Migration (for rollback)
-- DROP POLICY IF EXISTS org_isolation ON organizations;
-- DROP POLICY IF EXISTS org_isolation ON providers;
-- DROP POLICY IF EXISTS org_isolation ON patients;
-- DROP POLICY IF EXISTS insurance_access ON patient_insurance;
-- DROP POLICY IF EXISTS authorization_access ON authorizations;
-- DROP POLICY IF EXISTS org_isolation ON appointments;
-- DROP POLICY IF EXISTS session_access ON sessions;
-- DROP POLICY IF EXISTS event_access ON session_events;
-- DROP POLICY IF EXISTS claim_access ON claims;
-- DROP POLICY IF EXISTS audit_read ON audit_logs;
-- DROP POLICY IF EXISTS audit_insert ON audit_logs;
