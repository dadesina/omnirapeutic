-- Migration 008: Billing Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Claims (EDI 837P billing submissions)
CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  authorization_id uuid REFERENCES authorizations(id) ON DELETE SET NULL,
  payer_id text NOT NULL,
  claim_number text UNIQUE,

  -- EDI data
  edi_payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID', 'DENIED')),
  submitted_at timestamptz,
  response_payload jsonb,
  rejection_reason text,

  -- Financial
  billed_amount numeric(10, 2),
  paid_amount numeric(10, 2),
  payment_date date,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for claims
CREATE INDEX idx_claims_session ON claims(session_id);
CREATE INDEX idx_claims_auth ON claims(authorization_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_payer ON claims(payer_id, status);
CREATE INDEX idx_claims_submitted ON claims(submitted_at) WHERE submitted_at IS NOT NULL;

-- Output confirmation
SELECT 'Billing tables created successfully' AS status;
