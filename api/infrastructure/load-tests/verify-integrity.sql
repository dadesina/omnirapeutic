-- Database Integrity Verification for Load Testing
-- Checks for overbooking after performance tests

\echo '=== Authorization Unit Integrity Check ==='
\echo 'Checking for authorizations where (usedUnits + scheduledUnits) > totalUnits...'
\echo ''

SELECT
  id,
  "authNumber",
  "totalUnits",
  "usedUnits",
  "scheduledUnits",
  ("usedUnits" + "scheduledUnits") AS total_allocated,
  (("usedUnits" + "scheduledUnits") - "totalUnits") AS units_overbooked
FROM "Authorization"
WHERE ("usedUnits" + "scheduledUnits") > "totalUnits";

\echo ''
\echo '=== Expected Result: 0 rows ==='
\echo 'If any rows returned above, SERIALIZABLE isolation failed to prevent overbooking!'
\echo ''

-- Summary statistics
\echo '=== Authorization Statistics ==='
SELECT
  COUNT(*) AS total_authorizations,
  SUM("totalUnits") AS total_units_authorized,
  SUM("usedUnits") AS total_units_used,
  SUM("scheduledUnits") AS total_units_scheduled,
  SUM("totalUnits" - "usedUnits" - "scheduledUnits") AS total_units_available
FROM "Authorization";
