-- Migration 007: Session Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Sessions (clinical encounters/therapy sessions)
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  authorization_id uuid REFERENCES authorizations(id) ON DELETE SET NULL,
  service_code text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes integer,
  billed_units integer,
  status text NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'REQUIRES_REVIEW', 'CANCELLED')),
  location text,

  -- Clinical data
  latest_metrics jsonb,
  ai_note_json jsonb,
  voice_note_url text,
  voice_transcript text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for sessions
CREATE INDEX idx_sessions_patient ON sessions(patient_id, start_time DESC);
CREATE INDEX idx_sessions_provider ON sessions(provider_id, start_time DESC);
CREATE INDEX idx_sessions_auth ON sessions(authorization_id);
CREATE INDEX idx_sessions_status ON sessions(status) WHERE status IN ('IN_PROGRESS', 'REQUIRES_REVIEW');

-- Session Events (append-only log for behavioral data)
-- Client-side aggregation pattern - no triggers
CREATE TABLE session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_timestamp timestamptz DEFAULT now(),
  raw_value numeric,
  metadata jsonb,
  recorded_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now()
);

-- Indexes for session_events
CREATE INDEX idx_events_session ON session_events(session_id, event_timestamp);
CREATE INDEX idx_events_type ON session_events(event_type);

-- Output confirmation
SELECT 'Session tables created successfully' AS status;
