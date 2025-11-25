-- Migration: Create claims table
-- Description: Stores EDI 837P insurance claims with submission tracking
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id),
  authorization_id uuid REFERENCES authorizations(id),
  payer_id text NOT NULL,
  claim_number text UNIQUE,
  edi_payload jsonb NOT NULL,
  status text CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID')),
  submitted_at timestamptz,
  response_payload jsonb,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE claims IS 'EDI 837P insurance claims with submission tracking and response handling';
COMMENT ON COLUMN claims.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN claims.session_id IS 'Foreign key to sessions table (one claim per session)';
COMMENT ON COLUMN claims.authorization_id IS 'Foreign key to authorizations table';
COMMENT ON COLUMN claims.payer_id IS 'EDI payer identifier for routing';
COMMENT ON COLUMN claims.claim_number IS 'Unique claim control number (generated or payer-assigned)';
COMMENT ON COLUMN claims.edi_payload IS 'Complete EDI 837P claim data in JSON format';
COMMENT ON COLUMN claims.status IS 'DRAFT (not submitted), SUBMITTED (sent to clearinghouse), ACCEPTED (payer received), REJECTED (validation error), PAID (payment received)';
COMMENT ON COLUMN claims.submitted_at IS 'Timestamp when claim was submitted to Stedi';
COMMENT ON COLUMN claims.response_payload IS 'EDI 277/835 response data from payer';
COMMENT ON COLUMN claims.rejection_reason IS 'Human-readable rejection reason (if status = REJECTED)';

-- Create indexes for claim queries
CREATE INDEX IF NOT EXISTS idx_claims_session ON claims(session_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_submitted ON claims(submitted_at DESC) WHERE submitted_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS claims CASCADE;
