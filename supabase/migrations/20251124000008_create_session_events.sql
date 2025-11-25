-- Migration: Create session_events table
-- Description: Append-only event log for clinical data collection
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_timestamp timestamptz DEFAULT now(),
  raw_value numeric,
  metadata jsonb,
  recorded_by uuid REFERENCES providers(id)
);

-- Add comments for documentation
COMMENT ON TABLE session_events IS 'Append-only event log for clinical data collection (tantrums, manding, behaviors, etc.)';
COMMENT ON COLUMN session_events.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN session_events.session_id IS 'Foreign key to sessions table';
COMMENT ON COLUMN session_events.event_type IS 'Event type code (TANT_START, TANT_END, MAND_C, MAND_I, DURATION_ADD, etc.)';
COMMENT ON COLUMN session_events.event_timestamp IS 'Exact timestamp when event occurred (client timezone)';
COMMENT ON COLUMN session_events.raw_value IS 'Numeric value for quantifiable events (duration in seconds, frequency count, etc.)';
COMMENT ON COLUMN session_events.metadata IS 'Additional event context (behavior details, intervention used, etc.)';
COMMENT ON COLUMN session_events.recorded_by IS 'Provider who recorded the event (for audit trail)';

-- Create indexes for event queries and aggregation
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, event_timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(event_type, event_timestamp);

-- Enable Row Level Security
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS session_events CASCADE;
