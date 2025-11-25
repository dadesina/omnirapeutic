#!/bin/bash
# Database Migration Deployment Script
# Sprint 4 Phase 1A: Database Foundation
# Date: 2025-11-24

set -e  # Exit on error

echo "=========================================="
echo "Database Migration Deployment"
echo "Sprint 4 Phase 1A"
echo "=========================================="
echo ""

# Configuration
DB_HOST="omnirapeutic-production.cluster-c65q0emgwv43.us-east-1.rds.amazonaws.com"
DB_USER="admin"
DB_NAME="omnirapeutic"
DB_PASSWORD="$1"
MIGRATIONS_DIR="/root/projects/omnirapeutic/infrastructure/migrations"

if [ -z "$DB_PASSWORD" ]; then
  echo "Error: Database password not provided"
  echo "Usage: $0 <database_password>"
  exit 1
fi

# Create .pgpass file for password-less authentication
export PGPASSFILE="/tmp/.pgpass"
echo "$DB_HOST:5432:$DB_NAME:$DB_USER:$DB_PASSWORD" > $PGPASSFILE
chmod 600 $PGPASSFILE

echo "Step 1: Testing database connection..."
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null
if [ $? -eq 0 ]; then
  echo "✓ Database connection successful"
else
  echo "✗ Database connection failed"
  exit 1
fi
echo ""

echo "Step 2: Checking current database state..."
TABLE_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
echo "Existing tables: $TABLE_COUNT"
echo ""

if [ "$TABLE_COUNT" -gt "0" ]; then
  echo "Warning: Database contains $TABLE_COUNT tables"
  echo "This script is designed for fresh database deployment"
  read -p "Continue anyway? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
  fi
fi

echo "Step 3: Executing migrations..."
echo ""

for migration in $(ls -1 $MIGRATIONS_DIR/*.sql | sort); do
  MIGRATION_NAME=$(basename $migration)
  echo "Executing: $MIGRATION_NAME"

  psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f $migration

  if [ $? -eq 0 ]; then
    echo "✓ $MIGRATION_NAME completed successfully"
  else
    echo "✗ $MIGRATION_NAME failed"
    echo "Deployment stopped. Please review errors above."
    exit 1
  fi
  echo ""
done

echo "Step 4: Verification..."
echo ""

echo "Tables created:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
echo ""

echo "RLS policies enabled:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true ORDER BY tablename;"
echo ""

echo "App schema functions:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'app' ORDER BY routine_name;"
echo ""

# Cleanup
rm -f $PGPASSFILE

echo "=========================================="
echo "Migration deployment complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Run validation tests in /root/projects/omnirapeutic/infrastructure/tests/"
echo "2. Verify pgAudit logs in CloudWatch"
echo "3. Proceed with Phase 1B: API Layer development"
