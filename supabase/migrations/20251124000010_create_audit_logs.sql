-- Migration: Create audit_logs table (HIPAA CRITICAL)
-- Description: Immutable audit log for HIPAA compliance
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES providers(id),
  user_email text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  details jsonb,
  organization_id uuid REFERENCES organizations(id)
);

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'HIPAA-compliant immutable audit log (all PHI access must be logged)';
COMMENT ON COLUMN audit_logs.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN audit_logs.timestamp IS 'Exact timestamp of action (immutable)';
COMMENT ON COLUMN audit_logs.user_id IS 'Foreign key to providers table (who performed action)';
COMMENT ON COLUMN audit_logs.user_email IS 'User email at time of action (denormalized for audit integrity)';
COMMENT ON COLUMN audit_logs.action IS 'Action type (VIEW_PATIENT, EDIT_SESSION, GENERATE_NOTE, CREATE_CLAIM, etc.)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Resource type (patient, session, authorization, claim, etc.)';
COMMENT ON COLUMN audit_logs.resource_id IS 'UUID of the resource accessed/modified';
COMMENT ON COLUMN audit_logs.ip_address IS 'Client IP address (for security audit)';
COMMENT ON COLUMN audit_logs.user_agent IS 'Client user agent string';
COMMENT ON COLUMN audit_logs.details IS 'Additional context (changed fields, query parameters, etc.)';
COMMENT ON COLUMN audit_logs.organization_id IS 'Organization context for multi-tenant isolation';

-- Make audit logs immutable (HIPAA requirement)
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON audit_logs FROM anon;

-- Create indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- Note: Audit logs should NEVER be deleted in production
-- DROP TABLE IF EXISTS audit_logs CASCADE;
