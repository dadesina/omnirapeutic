-- Migration: Create sessions table
-- Description: Stores clinical session records with AI-generated notes
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES providers(id),
  authorization_id uuid REFERENCES authorizations(id),
  service_code text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes integer,
  billed_units integer,
  status text CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'REQUIRES_REVIEW')),
  location text,
  latest_metrics jsonb,
  ai_note_json jsonb,
  voice_note_url text,
  voice_transcript text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE sessions IS 'Clinical session records with AI-generated documentation and metrics';
COMMENT ON COLUMN sessions.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN sessions.appointment_id IS 'Foreign key to appointments table (nullable for walk-ins)';
COMMENT ON COLUMN sessions.patient_id IS 'Foreign key to patients table';
COMMENT ON COLUMN sessions.provider_id IS 'Foreign key to providers table (RBT/BCBA conducting session)';
COMMENT ON COLUMN sessions.authorization_id IS 'Foreign key to authorizations table (units deducted from here)';
COMMENT ON COLUMN sessions.service_code IS 'CPT code billed for this session';
COMMENT ON COLUMN sessions.start_time IS 'Actual session start time (may differ from appointment)';
COMMENT ON COLUMN sessions.end_time IS 'Actual session end time (set when session completes)';
COMMENT ON COLUMN sessions.duration_minutes IS 'Calculated duration for billing (8-minute rule applied)';
COMMENT ON COLUMN sessions.billed_units IS 'Final billable units (duration_minutes / 15, rounded up)';
COMMENT ON COLUMN sessions.status IS 'IN_PROGRESS (active), COMPLETED (note generated), REQUIRES_REVIEW (manual review needed)';
COMMENT ON COLUMN sessions.location IS 'Service location (HOME, CLINIC, SCHOOL, TELEHEALTH)';
COMMENT ON COLUMN sessions.latest_metrics IS 'Client-side aggregated metrics (tantrums, manding, etc.) updated every 10 seconds';
COMMENT ON COLUMN sessions.ai_note_json IS 'AI-generated SOAP note (Subjective, Objective, Assessment, Plan)';
COMMENT ON COLUMN sessions.voice_note_url IS 'Storage URL for voice recording (Supabase Storage)';
COMMENT ON COLUMN sessions.voice_transcript IS 'Whisper API transcription of voice note';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_authorization ON sessions(authorization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status) WHERE status = 'IN_PROGRESS';

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS sessions CASCADE;
