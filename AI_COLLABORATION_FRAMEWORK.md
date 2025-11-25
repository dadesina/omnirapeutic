# AI Collaboration Framework for Omnirapeutic Implementation

**Version:** 1.0
**Created:** 2025-11-24
**Purpose:** Define structured collaboration between Claude Code (AI) and human developers

---

## Overview

This framework establishes clear boundaries, workflows, and quality gates for hybrid AI-assisted implementation of Omnirapeutic. It ensures Claude Code accelerates development while humans maintain oversight on critical paths.

**Target:** 50-60% AI contribution, 40-50% human oversight
**Timeline Impact:** Reduce 24-week plan to 16-20 weeks

---

## Phase 1: Foundation & Compliance - Task Delegation Matrix

**Duration:** Weeks 1-3
**AI Contribution:** 80%

### Task Breakdown

| Task ID | Task Description | Owner | Priority | Success Criteria |
|---------|-----------------|-------|----------|------------------|
| **1.1** | **Database Schema Generation** | AI | P0 | All tables created with constraints |
| 1.1.1 | Generate migration file for `organizations` table | AI | P0 | Table created with all columns |
| 1.1.2 | Generate migration file for `providers` table | AI | P0 | Foreign key to organizations |
| 1.1.3 | Generate migration file for `patients` table | AI | P0 | RLS-ready structure |
| 1.1.4 | Generate migration file for `patient_insurance` table | AI | P0 | JSON fields for eligibility |
| 1.1.5 | Generate migration file for `authorizations` table | AI | P0 | Check constraint: positive_balance |
| 1.1.6 | Generate migration file for `appointments` table | AI | P0 | Indexes for time-based queries |
| 1.1.7 | Generate migration file for `sessions` table | AI | P0 | JSONB for latest_metrics |
| 1.1.8 | Generate migration file for `session_events` table | AI | P0 | Append-only structure |
| 1.1.9 | Generate migration file for `claims` table | AI | P0 | JSONB for EDI payload |
| 1.1.10 | Generate migration file for `audit_logs` table | AI | P0 | Immutable logs |
| | | | | |
| **1.2** | **Database Functions** | HUMAN | P0 | All functions created and tested |
| 1.2.1 | Implement `reserve_session_units()` function | HUMAN | P0 | Atomic with FOR UPDATE lock |
| 1.2.2 | Implement `adjust_authorization_units()` function | HUMAN | P0 | Handles positive/negative adjustments |
| 1.2.3 | Implement `check_scheduling_conflict()` function | HUMAN | P0 | Prevents double-booking |
| 1.2.4 | Implement `auth.user_organization_id()` helper | AI | P1 | Returns current user's org ID |
| | | | | |
| **1.3** | **Row Level Security Policies** | HYBRID | P0 | 100% cross-org isolation |
| 1.3.1 | Enable RLS on all tables | AI | P0 | RLS enabled on 10 tables |
| 1.3.2 | Generate RLS policy boilerplate for patients | AI | P0 | Policy created |
| 1.3.3 | Generate RLS policy boilerplate for providers | AI | P0 | Policy created |
| 1.3.4 | Generate RLS policy boilerplate for appointments | AI | P0 | Policy created |
| 1.3.5 | Generate RLS policy for sessions (inherited) | AI | P1 | Subquery-based policy |
| 1.3.6 | Generate RLS policy for audit_logs (read-only) | AI | P1 | SELECT only policy |
| 1.3.7 | **Review and validate all RLS policies** | HUMAN | P0 | Cross-org test passes |
| | | | | |
| **1.4** | **TypeScript Interfaces** | AI | P1 | Type-safe data access |
| 1.4.1 | Generate TypeScript interface for Organizations | AI | P1 | Matches DB schema |
| 1.4.2 | Generate TypeScript interface for Providers | AI | P1 | Includes credentials JSONB |
| 1.4.3 | Generate TypeScript interface for Patients | AI | P1 | Date types correct |
| 1.4.4 | Generate TypeScript interface for Authorizations | AI | P1 | Enum for status |
| 1.4.5 | Generate TypeScript interface for Sessions | AI | P1 | Metrics interface nested |
| 1.4.6 | Generate TypeScript interface for AuditLogs | AI | P1 | Details JSONB typed |
| | | | | |
| **1.5** | **Audit Logging Implementation** | HYBRID | P0 | All actions logged |
| 1.5.1 | Create Supabase Edge Function: log-access | AI | P0 | Function deployed |
| 1.5.2 | Create client hook: useAuditLog | AI | P0 | Hook returns log function |
| 1.5.3 | **Review audit logging completeness** | HUMAN | P0 | All PHI access logged |
| | | | | |
| **1.6** | **Secrets Management** | HUMAN | P0 | No hardcoded secrets |
| 1.6.1 | Set up AWS Secrets Manager | HUMAN | P0 | Account configured |
| 1.6.2 | Store OpenAI API key | HUMAN | P0 | Secret created |
| 1.6.3 | Store Gemini API key | HUMAN | P0 | Secret created |
| 1.6.4 | Store Stedi API key | HUMAN | P0 | Secret created |
| 1.6.5 | Store Supabase service role key | HUMAN | P0 | Secret created |
| 1.6.6 | Create secrets helper library | AI | P1 | getSecret() function |
| | | | | |
| **1.7** | **Basic CRUD Operations** | AI | P1 | Type-safe operations |
| 1.7.1 | Generate CRUD for patients | AI | P1 | Create, read, update, delete |
| 1.7.2 | Generate CRUD for providers | AI | P1 | Create, read, update, delete |
| 1.7.3 | Generate CRUD for authorizations | AI | P1 | Create, read, update, delete |
| 1.7.4 | Add audit logging to all CRUD operations | AI | P1 | useAuditLog integrated |
| | | | | |
| **1.8** | **Testing & Validation** | HYBRID | P0 | All tests pass |
| 1.8.1 | Write unit tests for CRUD operations | AI | P1 | 80% coverage |
| 1.8.2 | Write integration tests for RLS policies | HUMAN | P0 | Cross-org isolation verified |
| 1.8.3 | Write tests for atomic authorization function | HUMAN | P0 | Concurrent requests tested |
| 1.8.4 | Seed test data (1 org, 3 providers, 5 patients) | AI | P1 | Test data script |
| 1.8.5 | Run security scan on generated code | HUMAN | P0 | No vulnerabilities |
| | | | | |
| **1.9** | **Documentation** | AI | P2 | Schema documented |
| 1.9.1 | Generate ERD diagram from schema | AI | P2 | Visual schema |
| 1.9.2 | Document all database functions | AI | P2 | Function signatures |
| 1.9.3 | Create API documentation for CRUD | AI | P2 | OpenAPI spec |

---

## AI Task Templates

### Template 1: Database Migration Generation

**Input to Claude Code:**

```
Task: Generate Supabase migration file for [TABLE_NAME]

Schema Definition:
[PASTE EXACT SCHEMA FROM REVISED_IMPLEMENTATION_PLAN.md]

Requirements:
1. Use gen_random_uuid() for primary keys
2. Include all foreign key constraints
3. Add check constraints where specified
4. Create indexes as specified
5. Add created_at and updated_at timestamps
6. Follow Supabase migration file naming: YYYYMMDDHHMMSS_create_[table_name].sql

Output Format:
- Single SQL migration file
- Include UP migration (CREATE TABLE)
- Include DOWN migration (DROP TABLE)
- Add comments for complex constraints

Success Criteria:
- Migration runs without errors
- All constraints are enforced
- Indexes are created
```

**Expected AI Output:**

```sql
-- Migration: 20250124100000_create_organizations.sql

-- UP Migration
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text UNIQUE,
  npi text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comment
COMMENT ON TABLE organizations IS 'Multi-tenant root for all data isolation';

-- DOWN Migration
DROP TABLE IF EXISTS organizations;
```

### Template 2: TypeScript Interface Generation

**Input to Claude Code:**

```
Task: Generate TypeScript interface for [TABLE_NAME]

Database Schema:
[PASTE TABLE DEFINITION]

Requirements:
1. Match PostgreSQL types to TypeScript types:
   - uuid -> string
   - text -> string
   - integer -> number
   - boolean -> boolean
   - timestamptz -> string (ISO 8601)
   - jsonb -> typed object or unknown
   - date -> string (YYYY-MM-DD)
2. Mark optional fields with ?
3. Export interface
4. Add JSDoc comments
5. Create separate type for INSERT operations (omit id, timestamps)

Output Format:
- Single TypeScript file
- Export both full type and insert type
- Include enums if applicable

Success Criteria:
- Compiles without errors
- Matches database schema exactly
```

**Expected AI Output:**

```typescript
// types/database.ts

/**
 * Organization entity - Multi-tenant root
 */
export interface Organization {
  id: string;
  name: string;
  tax_id: string | null;
  npi: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Data required to create a new organization
 */
export interface OrganizationInsert {
  name: string;
  tax_id?: string;
  npi?: string;
}
```

### Template 3: RLS Policy Generation

**Input to Claude Code:**

```
Task: Generate Row Level Security policy for [TABLE_NAME]

Requirements:
1. Enable RLS on the table
2. Create policy for organization isolation
3. Use auth.user_organization_id() helper function
4. Policy name: org_isolation
5. Apply to all operations (SELECT, INSERT, UPDATE, DELETE)

Schema Context:
[PASTE TABLE DEFINITION]

Success Criteria:
- Users can only see their own organization's data
- Policy applies to all CRUD operations
- No performance impact (uses indexed columns)
```

**Expected AI Output:**

```sql
-- Enable RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Create organization isolation policy
CREATE POLICY org_isolation ON patients
  FOR ALL
  USING (organization_id = auth.user_organization_id());

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO authenticated;
```

### Template 4: CRUD Operations Generation

**Input to Claude Code:**

```
Task: Generate type-safe CRUD operations for [TABLE_NAME]

TypeScript Interface:
[PASTE INTERFACE]

Requirements:
1. Use Supabase client
2. Add error handling
3. Integrate useAuditLog hook for all operations
4. Return typed results
5. Handle RLS errors gracefully

Operations to Generate:
- create[TableName]
- get[TableName]ById
- update[TableName]
- delete[TableName]
- list[TableName] (with pagination)

Success Criteria:
- Type-safe (no any types)
- Error handling on all operations
- Audit logging integrated
- Returns { data, error } pattern
```

**Expected AI Output:**

```typescript
// lib/crud/patients.ts
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { Patient, PatientInsert } from '@/types/database';

export async function createPatient(data: PatientInsert): Promise<{ data: Patient | null; error: Error | null }> {
  const supabase = useSupabaseClient();
  const logAccess = useAuditLog();

  try {
    const { data: patient, error } = await supabase
      .from('patients')
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    await logAccess('CREATE_PATIENT', 'patient', patient.id);

    return { data: patient, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function getPatientById(id: string): Promise<{ data: Patient | null; error: Error | null }> {
  const supabase = useSupabaseClient();
  const logAccess = useAuditLog();

  try {
    const { data: patient, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    await logAccess('VIEW_PATIENT', 'patient', patient.id);

    return { data: patient, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

// ... other CRUD operations
```

---

## Human Review Checklists

### Checklist 1: Database Schema Review

**Reviewer:** Backend Engineer/Architect

**Validation Points:**
- [ ] All foreign keys correctly reference parent tables
- [ ] Check constraints prevent invalid data (e.g., positive_balance)
- [ ] Indexes created on commonly queried columns
- [ ] JSONB fields have appropriate structure
- [ ] Enum values in CHECK constraints match application logic
- [ ] created_at/updated_at timestamps present
- [ ] No SQL injection vulnerabilities
- [ ] Performance considerations for large datasets

**Security Checks:**
- [ ] No sensitive data in table comments
- [ ] No hardcoded credentials
- [ ] Proper data types for PHI fields

**Sign-off:**
- Reviewer Name: _______________
- Date: _______________
- Approved: [ ] YES [ ] NO
- Notes: _______________

### Checklist 2: RLS Policy Review

**Reviewer:** Security Engineer/Backend Architect

**Critical Validation:**
- [ ] RLS enabled on ALL tables containing PHI
- [ ] Policies use indexed columns (organization_id)
- [ ] No possibility of cross-organization data leakage
- [ ] Policies apply to all operations (SELECT, INSERT, UPDATE, DELETE)
- [ ] Service role bypasses RLS correctly (for admin operations)
- [ ] Error messages don't leak information about other orgs

**Testing:**
- [ ] Create 2 test organizations
- [ ] Create data in Org A
- [ ] Attempt to access Org A data as Org B user
- [ ] Verify: Access denied
- [ ] Verify: No error messages reveal Org A data exists

**Performance:**
- [ ] Query plan shows index usage
- [ ] No sequential scans on large tables
- [ ] Policy execution time < 10ms

**Sign-off:**
- Reviewer Name: _______________
- Date: _______________
- Approved: [ ] YES [ ] NO [ ] NEEDS REVISION
- Notes: _______________

### Checklist 3: Audit Logging Review

**Reviewer:** HIPAA Compliance Officer/Security Engineer

**Completeness Check:**
- [ ] All PHI read operations logged (VIEW_PATIENT, VIEW_SESSION, etc.)
- [ ] All PHI write operations logged (CREATE, UPDATE, DELETE)
- [ ] User identity captured (user_id, user_email)
- [ ] Timestamp captured
- [ ] IP address captured (if available)
- [ ] User agent captured
- [ ] Resource type and ID captured
- [ ] Action details captured in JSONB

**Immutability Check:**
- [ ] UPDATE revoked on audit_logs
- [ ] DELETE revoked on audit_logs
- [ ] No triggers allow modification
- [ ] Service role cannot modify logs

**Retention Check:**
- [ ] Retention policy documented (7-10 years)
- [ ] Backup strategy includes audit logs
- [ ] Log rotation strategy defined

**Sign-off:**
- Reviewer Name: _______________
- Date: _______________
- Approved: [ ] YES [ ] NO
- Notes: _______________

### Checklist 4: Atomic Authorization Function Review

**Reviewer:** Senior Backend Engineer

**Logic Validation:**
- [ ] Uses FOR UPDATE lock to prevent concurrent access
- [ ] Checks authorization expiration before reserving
- [ ] Checks available units before reserving
- [ ] Returns detailed error messages
- [ ] Increments used_units atomically
- [ ] Handles edge cases (exactly 0 units available)

**Concurrency Testing:**
- [ ] Test with 2 simultaneous requests for same authorization
- [ ] Verify: Exactly one succeeds
- [ ] Verify: Final used_units matches expected value
- [ ] Test with 10 simultaneous requests
- [ ] Verify: No over-billing

**Error Handling:**
- [ ] AUTH_EXPIRED returns correct error
- [ ] INSUFFICIENT_UNITS returns correct error
- [ ] Error messages are user-friendly
- [ ] No database errors leak to client

**Sign-off:**
- Reviewer Name: _______________
- Date: _______________
- Approved: [ ] YES [ ] NO
- Notes: _______________

---

## Quality Gates

### Gate 1: Code Generation Complete

**Criteria:**
- [ ] All AI-assigned tasks marked complete
- [ ] All generated code compiles without errors
- [ ] All generated code passes linter (ESLint)
- [ ] All generated code formatted (Prettier)
- [ ] No TypeScript `any` types (unless explicitly approved)
- [ ] No hardcoded secrets

**Actions if Failed:**
- Provide specific feedback to AI
- Regenerate failing components
- Do not proceed to Gate 2

### Gate 2: Human Review Complete

**Criteria:**
- [ ] All review checklists completed
- [ ] All reviewers have signed off
- [ ] No P0 (critical) issues remain
- [ ] P1 (high) issues documented with resolution plan
- [ ] Security scan passed (no high/critical vulnerabilities)

**Actions if Failed:**
- Address all P0 issues immediately
- Create tickets for P1 issues
- Re-review after fixes
- Do not proceed to Gate 3

### Gate 3: Testing Complete

**Criteria:**
- [ ] Unit tests pass (80%+ coverage for business logic)
- [ ] Integration tests pass (RLS, CRUD, database functions)
- [ ] Security tests pass (cross-org isolation, SQL injection)
- [ ] Performance tests pass (query time < 100ms)
- [ ] Load tests pass (100 concurrent users)

**Actions if Failed:**
- Identify failing tests
- Fix issues (AI or human, based on complexity)
- Re-run full test suite
- Do not proceed to Gate 4

### Gate 4: Phase Sign-Off

**Criteria:**
- [ ] All success criteria met
- [ ] All quality gates passed
- [ ] Documentation complete
- [ ] No known P0/P1 bugs
- [ ] Team consensus: phase is complete
- [ ] Stakeholder approval obtained

**Actions if Failed:**
- Review incomplete items
- Assign owners for remaining work
- Set deadline for completion
- Do not start next phase

---

## Communication Protocol

### Daily Standups (AI + Humans)

**Format:**
1. Human developers share progress
2. Review AI-generated code from previous day
3. Assign new tasks to AI
4. Identify blockers

**AI Task Assignment Format:**
```
Task: [SPECIFIC TASK]
Input: [EXACT SPECIFICATIONS]
Expected Output: [DETAILED DESCRIPTION]
Success Criteria: [MEASURABLE CRITERIA]
Priority: [P0/P1/P2]
Due: [DATE/TIME]
```

### AI Blocker Escalation

**When AI Cannot Complete Task:**
1. AI documents specific blocker
2. AI suggests alternative approaches
3. Human reviews and decides:
   - Provide more context to AI
   - Reassign to human
   - Split into smaller tasks

**Blocker Template:**
```
Task ID: [ID]
Blocker: [SPECIFIC ISSUE]
Attempted Solutions: [WHAT AI TRIED]
Suggestions: [ALTERNATIVE APPROACHES]
Needs: [WHAT WOULD HELP]
```

### Code Review Protocol

**AI-Generated Code Review:**
1. AI completes task and commits to feature branch
2. AI opens draft PR with:
   - Description of changes
   - Test results
   - Known limitations
3. Human reviewer assigned within 4 hours
4. Human reviews using checklist
5. Human approves or requests changes
6. AI makes changes if requested
7. Human merges after approval

**Review SLA:**
- P0 tasks: Review within 2 hours
- P1 tasks: Review within 4 hours
- P2 tasks: Review within 24 hours

---

## Metrics & Monitoring

### AI Contribution Metrics

**Track Weekly:**
- Lines of code generated by AI
- Lines of code written by humans
- Number of AI tasks completed
- Number of AI tasks requiring human intervention
- AI code acceptance rate (approved vs rejected)

**Target Ratios (Phase 1):**
- AI LOC: 70-80%
- Human LOC: 20-30%
- AI task completion rate: > 80%
- AI code acceptance rate: > 70%

### Quality Metrics

**Track Weekly:**
- Test coverage percentage
- Number of bugs found in AI code
- Number of bugs found in human code
- Security vulnerabilities (AI vs human)
- Code review turnaround time

**Target Benchmarks:**
- Test coverage: > 80%
- Bugs per 1000 LOC: < 5
- Security vulnerabilities: 0 high/critical
- Code review time: < 4 hours for P1

### Velocity Metrics

**Track Weekly:**
- Story points completed (AI tasks)
- Story points completed (human tasks)
- Time to complete AI tasks vs estimate
- Time to complete human tasks vs estimate

**Goal:**
- Maintain or exceed planned velocity
- AI tasks complete 2-3x faster than human estimates
- No reduction in code quality

---

## Phase 1 Specific Instructions for Claude Code

### Getting Started

**Step 1: Read the Complete Context**
```
Please read the following files:
1. /root/projects/omnirapeutic/REVISED_IMPLEMENTATION_PLAN.md
2. /root/projects/omnirapeutic/AI_COLLABORATION_FRAMEWORK.md

Focus on Phase 1: Foundation & Compliance (pages 7-21)
```

**Step 2: Confirm Understanding**
```
Please confirm you understand:
1. The overall architecture (multi-tenant, RLS-based isolation)
2. The 10 database tables that need to be created
3. The critical atomic authorization function
4. The HIPAA audit logging requirements
5. The success criteria for Phase 1
```

**Step 3: Request First Task**
```
I'm ready to start implementing Phase 1. Please assign me tasks from the Task Delegation Matrix starting with:
- Task 1.1.1: Generate migration file for organizations table

I will follow Template 1: Database Migration Generation for the output format.
```

### Working Instructions

**For Each Task:**
1. Acknowledge task assignment
2. Confirm you have all required context
3. Generate code following the template
4. Run self-checks against success criteria
5. Submit code for human review
6. Address review feedback
7. Confirm task completion

**Code Style Guidelines:**
- Use TypeScript strict mode
- Follow Airbnb style guide
- Add JSDoc comments for all public functions
- Use meaningful variable names
- Keep functions under 50 lines
- Extract magic numbers to constants
- Add TODO comments for known limitations

**Testing Guidelines:**
- Write tests before implementation (TDD)
- Use descriptive test names
- Cover happy path and edge cases
- Mock external dependencies
- Aim for 80%+ coverage

---

## Success Indicators

### Phase 1 Success

**Technical:**
- All 10 tables created with correct schema
- All 3 database functions implemented and tested
- All RLS policies preventing cross-org access
- All CRUD operations type-safe and audited
- All tests passing (unit, integration, security)

**Process:**
- AI completed 80%+ of assigned tasks
- All AI code reviewed and approved
- No P0/P1 bugs in production
- Timeline on track (3 weeks)

**Team:**
- Clear communication between AI and humans
- No blockers lasting > 1 day
- Code review turnaround < 4 hours
- Team satisfaction with AI collaboration

---

## Appendix: Example Task Execution

### Example: Task 1.1.1 - Generate Organizations Table Migration

**Human Assigns Task:**
```
Task ID: 1.1.1
Task: Generate Supabase migration file for organizations table
Owner: Claude Code (AI)
Priority: P0

Schema Definition (from REVISED_IMPLEMENTATION_PLAN.md):
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text UNIQUE,
  npi text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

Requirements:
1. Follow Supabase migration naming: YYYYMMDDHHMMSS_create_organizations.sql
2. Include UP and DOWN migrations
3. Add table comment
4. Ensure idempotency (IF NOT EXISTS)

Success Criteria:
- Migration runs without errors
- All constraints enforced
- Timestamps auto-populate

Due: Today, 5:00 PM
```

**Claude Code Acknowledges:**
```
Task 1.1.1 acknowledged.

I understand I need to:
1. Create a Supabase migration file for the organizations table
2. Follow the exact schema provided
3. Include UP (CREATE) and DOWN (DROP) migrations
4. Make it idempotent
5. Add documentation

I have all the context I need. Starting implementation now.

Estimated completion: 10 minutes
```

**Claude Code Generates Code:**
```sql
-- Migration: 20250124103000_create_organizations.sql
-- Description: Create organizations table for multi-tenant root

-- UP Migration
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text UNIQUE,
  npi text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add table comment for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant root table. All data is isolated by organization_id.';

-- Add column comments
COMMENT ON COLUMN organizations.tax_id IS 'Federal Tax ID (EIN) for billing purposes';
COMMENT ON COLUMN organizations.npi IS 'National Provider Identifier for claims submission';

-- Create index on tax_id for billing lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_organizations_tax_id ON organizations(tax_id) WHERE tax_id IS NOT NULL;

-- DOWN Migration
-- Note: This will cascade delete all related data due to foreign key constraints
DROP TABLE IF EXISTS organizations CASCADE;
```

**Claude Code Submits for Review:**
```
Task 1.1.1 completed.

Generated file: supabase/migrations/20250124103000_create_organizations.sql

Self-check results:
✓ Follows naming convention
✓ Includes IF NOT EXISTS for idempotency
✓ All columns from spec present
✓ Includes UP and DOWN migrations
✓ Added documentation comments
✓ Added recommended index for tax_id
✓ Used NOT NULL for timestamps as best practice

Ready for human review.
```

**Human Reviews:**
```
Task 1.1.1 review:

✓ Schema matches specification
✓ Idempotent (IF NOT EXISTS)
✓ Good documentation
✓ Index on tax_id is a nice addition
✓ DOWN migration includes CASCADE (correct)

Approved. Please proceed to Task 1.1.2 (providers table).
```

**Claude Code Confirms:**
```
Task 1.1.1 approved and closed.

Moving to Task 1.1.2: Generate migration file for providers table.
Estimated completion: 10 minutes.
```

---

**END OF AI COLLABORATION FRAMEWORK**

This framework will be updated as we learn from Phase 1 execution.
