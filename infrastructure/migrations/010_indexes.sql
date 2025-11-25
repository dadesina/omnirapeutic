-- Migration 010: Additional Performance Indexes
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Additional composite indexes for common queries

-- Organizations (for admin queries)
CREATE INDEX idx_organizations_name ON organizations(name);

-- Users (for authentication and lookup)
CREATE INDEX idx_users_active_email ON users(email) WHERE is_active = true;
CREATE INDEX idx_users_org_role ON users(organization_id, role) WHERE is_active = true;

-- Patients (for search and filtering)
CREATE INDEX idx_patients_guardian ON patients(guardian_email) WHERE guardian_email IS NOT NULL;
CREATE INDEX idx_patients_dob ON patients(date_of_birth);

-- Authorizations (for unit tracking queries)
CREATE INDEX idx_auth_active_patient ON authorizations(patient_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_auth_expiring ON authorizations(end_date) WHERE status = 'ACTIVE' AND end_date >= CURRENT_DATE;

-- Sessions (for reporting and analytics)
CREATE INDEX idx_sessions_completed ON sessions(patient_id, start_time DESC) WHERE status = 'COMPLETED';
CREATE INDEX idx_sessions_date_range ON sessions(start_time, end_time) WHERE status = 'COMPLETED';

-- Claims (for billing reports)
CREATE INDEX idx_claims_date_range ON claims(submitted_at, status);

-- Output confirmation
SELECT 'Performance indexes created successfully' AS status;
