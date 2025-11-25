-- Rollback Script: Drop All Database Objects
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24
-- USE WITH CAUTION: This will delete all tables and data

\echo '=========================================='
\echo 'ROLLBACK: Dropping all database objects'
\echo '=========================================='
\echo ''
\echo 'WARNING: This will delete all tables and data!'
\echo 'Press Ctrl+C within 5 seconds to cancel...'
\echo ''

SELECT pg_sleep(5);

\echo 'Proceeding with rollback...'
\echo ''

-- Drop all tables in reverse dependency order
\echo 'Dropping tables...'

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TABLE IF EXISTS session_events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS authorizations CASCADE;
DROP TABLE IF EXISTS patient_insurance CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

\echo 'All tables dropped'
\echo ''

-- Drop functions
\echo 'Dropping functions...'

DROP FUNCTION IF EXISTS app.check_scheduling_conflict(uuid, uuid, timestamptz, timestamptz, uuid) CASCADE;
DROP FUNCTION IF EXISTS app.adjust_authorization_units(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS app.reserve_session_units(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS app.current_organization_id() CASCADE;
DROP FUNCTION IF EXISTS app.current_user_id() CASCADE;

\echo 'All functions dropped'
\echo ''

-- Drop schemas
\echo 'Dropping schemas...'

DROP SCHEMA IF EXISTS app CASCADE;

\echo 'App schema dropped'
\echo ''

-- Note: We don't drop extensions as they may be used by other databases
-- DROP EXTENSION IF EXISTS pgaudit;
-- DROP EXTENSION IF EXISTS pgcrypto;
-- DROP EXTENSION IF EXISTS "uuid-ossp";

\echo '=========================================='
\echo 'Rollback complete'
\echo 'Database is now in clean state'
\echo '=========================================='
