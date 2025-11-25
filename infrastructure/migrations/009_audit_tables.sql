-- Migration 009: Audit Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24
-- HIPAA CRITICAL: Immutable audit logging

-- Audit Logs (HIPAA-compliant access logging)
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),

  -- User context
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_email text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,

  -- Action details
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,

  -- Request context
  ip_address inet,
  user_agent text,
  request_id text,

  -- Additional details
  details jsonb,

  created_at timestamptz DEFAULT now()
);

-- Make audit logs immutable (no updates or deletes allowed)
-- This will be enforced via RLS policies
-- REVOKE UPDATE, DELETE will be handled in RLS migration

-- Indexes for audit queries
CREATE INDEX idx_audit_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id, timestamp DESC);
CREATE INDEX idx_audit_org ON audit_logs(organization_id, timestamp DESC);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- Output confirmation
SELECT 'Audit tables created successfully' AS status;
