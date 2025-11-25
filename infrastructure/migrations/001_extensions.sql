-- Migration 001: PostgreSQL Extensions
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pgaudit already installed during infrastructure setup
-- Verify it exists
SELECT * FROM pg_extension WHERE extname = 'pgaudit';

-- Output confirmation
SELECT 'Extensions installed successfully' AS status;
