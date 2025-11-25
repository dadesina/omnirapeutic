# Database Migration Deployment Instructions
## Sprint 4 Phase 1A - Manual Deployment via Bastion

**Status:** All migration files ready for deployment
**Location:** `/root/projects/omnirapeutic/infrastructure/migrations/`
**Database:** Aurora PostgreSQL (omnirapeutic-production)

---

## Quick Deployment (Recommended)

Execute this single command to deploy all migrations:

```bash
/root/projects/omnirapeutic/infrastructure/deploy_migrations.sh '8J)$wBPkz)ln?dp9gg(Jj33kKS$*O]xI'
```

**Note:** This will attempt direct connection first, then fall back to bastion if needed.

---

## Manual Deployment via Bastion (If Direct Connection Fails)

### Step 1: Connect to Bastion

```bash
aws ssm start-session --target i-0f6b7bae60da49bb0 --region us-east-1
```

### Step 2: Install PostgreSQL Client (if needed)

```bash
sudo apt-get update && sudo apt-get install -y postgresql-client
```

### Step 3: Create Combined Migration File

On bastion, create `/tmp/deploy_db.sql`:

```bash
cat > /tmp/deploy_db.sql << 'EOSQL'
# Paste contents of /tmp/combined_migration.sql here
# Or use the individual migration files from local system
EOSQL
```

### Step 4: Create .pgpass File

```bash
cat > ~/.pgpass << 'PGPASS'
omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com:5432:omnirapeutic:admin:8J)$wBPkz)ln?dp9gg(Jj33kKS$*O]xI
PGPASS
chmod 600 ~/.pgpass
```

### Step 5: Test Connection

```bash
psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
     -U admin \
     -d omnirapeutic \
     -c "SELECT version();"
```

### Step 6: Execute Migrations

**Option A: All at once (combined file)**
```bash
psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
     -U admin \
     -d omnirapeutic \
     < /tmp/deploy_db.sql
```

**Option B: One by one (if combined file not available)**
```bash
# Copy individual migration files to bastion first
for f in 001 002 003 004 005 006 007 008 009 010 011; do
  psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
       -U admin \
       -d omnirapeutic \
       -f /tmp/migrations/${f}_*.sql
done
```

### Step 7: Verify Deployment

```bash
psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
     -U admin \
     -d omnirapeutic << 'VERIFY'
-- Check tables
SELECT COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Expected: 11

-- Check RLS
SELECT COUNT(*) as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;
-- Expected: 11

-- Check functions
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'app'
ORDER BY routine_name;
-- Expected: 5 functions
VERIFY
```

---

## Alternative: Use Provided Deployment Script

A complete deployment script is available at:
`/root/projects/omnirapeutic/infrastructure/deploy_migrations.sh`

This script:
- Tests connection
- Checks current database state
- Executes all 11 migrations sequentially
- Validates deployment
- Provides detailed output

---

## Migration Files (11 total)

1. **001_extensions.sql** - PostgreSQL extensions (uuid-ossp, pgcrypto)
2. **002_schemas.sql** - App schema for helper functions
3. **003_core_tables.sql** - organizations, users, staff_members
4. **004_clinical_tables.sql** - patients, patient_insurance
5. **005_authorization_tables.sql** - authorizations (with unit tracking)
6. **006_scheduling_tables.sql** - appointments
7. **007_session_tables.sql** - sessions, session_events
8. **008_billing_tables.sql** - claims
9. **009_audit_tables.sql** - audit_logs (HIPAA-compliant)
10. **010_indexes.sql** - Performance indexes
11. **011_rls_policies.sql** - RLS policies and atomic functions

---

## Success Criteria

After deployment, verify:
- [ ] 11 tables created
- [ ] All tables have RLS enabled
- [ ] 5 functions in app schema
- [ ] No errors in deployment
- [ ] Can query tables (with proper org context)

---

## Troubleshooting

**Connection timeout:**
- Ensure bastion instance is running
- Verify security group allows bastion → Aurora traffic
- Check VPC routing

**Permission denied:**
- Verify database password is correct
- Check .pgpass file permissions (must be 600)

**Function errors:**
- Ensure app schema was created (002_schemas.sql)
- Check that plpgsql extension is enabled

**RLS policy errors:**
- Verify all tables exist before running 011_rls_policies.sql
- Check for duplicate policy names

---

## Rollback

If deployment fails:

```bash
psql -h omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com \
     -U admin \
     -d omnirapeutic \
     -f /root/projects/omnirapeutic/infrastructure/rollback/rollback_all.sql
```

---

## Next Steps

After successful deployment:

1. Run validation tests (`/root/projects/omnirapeutic/infrastructure/tests/`)
2. Verify pgAudit logs in CloudWatch
3. Proceed to Phase 1B: API Layer development

