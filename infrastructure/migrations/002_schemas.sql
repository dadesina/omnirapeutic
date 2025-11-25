-- Migration 002: Create Schemas
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Create app schema for helper functions
-- This separates application logic from public tables
CREATE SCHEMA IF NOT EXISTS app;

-- Grant usage on app schema to authenticated users
GRANT USAGE ON SCHEMA app TO PUBLIC;

-- Output confirmation
SELECT 'Schemas created successfully' AS status;
