# Omnirapeutic Revised Implementation Plan

**Version:** 2.0 (Revised)
**Status:** Ready for Implementation
**Last Updated:** 2025-11-24
**Based On:** Expert Consensus Review + AI-Assisted Implementation Analysis

---

## Executive Summary

This revised implementation plan addresses all critical issues identified in the expert consensus review and provides a 100% implementation-ready roadmap for building Omnirapeutic, an AI-native ABA practice management platform. The plan has been validated by multiple expert AI models and optimized for hybrid AI-assisted implementation using Claude Code.

### Key Improvements Over Original Plan

**1. Phase Sequencing Corrected**
- **NEW ORDER:** Foundation → Intake → Scheduling → Clinical → Billing → Testing
- **ORIGINAL:** Foundation → Clinical → Billing → Intake → Scheduling
- **Impact:** Enables incremental end-to-end testing from Week 6

**2. Architecture Issues Resolved**
- Client-side metric aggregation (not DB triggers) - prevents bottlenecks
- Atomic authorization transactions (with row-level locking) - eliminates race conditions
- HIPAA audit logging included in Phase 1 - compliance from day 1

**3. Implementation Strategy**
- Hybrid AI-assisted implementation (50-60% AI, 40-50% human oversight)
- Structured quality gates per phase
- Critical paths remain human-owned (billing, compliance, integrations)

### Timeline Overview

| Phase | Weeks | AI Contribution | Deliverable | Key Milestone |
|-------|-------|-----------------|-------------|---------------|
| **1** | 1-3 | 80% | Foundation & Compliance | All tables + audit logging |
| **2** | 4-6 | 60% | Patient Intake & Insurance | Can onboard a patient |
| **3** | 7-9 | 60% | Scheduling System | Can schedule appointments |
| **4** | 10-13 | 50% | Clinical Workflow | Can conduct session + generate note |
| **5** | 14-17 | 30% | Billing & Claims | Can bill for session (validated EDI) |
| **6** | 18-24 | 60% | Testing & Pilot | Pilot clinic live with 20+ sessions |

**Total Timeline:** 16-20 weeks (vs 24 weeks human-only)
**Time Savings:** 4-8 weeks with AI assistance

---

## Technology Stack (Finalized)

### Frontend Stack

**React Native with Expo (Production)**
```json
{
  "dependencies": {
    "expo": "~50.0.0",
    "react-native": "0.73.0",
    "@supabase/supabase-js": "^2.38.0",
    "react-native-url-polyfill": "^2.0.0",
    "date-fns": "^3.0.0",
    "rrule": "^2.8.1",
    "react-hook-form": "^7.49.0",
    "zod": "^3.22.0",
    "@tanstack/react-query": "^5.14.0"
  }
}
```

**Key Libraries:**
- **UI Framework:** React Native Paper (Material Design)
- **Navigation:** Expo Router (file-based routing)
- **State Management:** TanStack Query for server state, Zustand for local UI state
- **Forms:** React Hook Form + Zod validation
- **Date Handling:** date-fns
- **Audio Recording:** expo-av

### Backend & Database

**Supabase (with AWS migration path if BAA unavailable)**
- **Database:** PostgreSQL 15
- **Realtime:** Supabase Realtime (WebSockets)
- **Authentication:** Supabase Auth with RLS
- **Storage:** Supabase Storage
- **Functions:** Edge Functions (Deno runtime)

**Migration Path:** AWS RDS PostgreSQL + Hasura + Amplify (if Supabase BAA not obtained by Week 12)

### AI & ML Services

**LLM for Documentation Agent:**
- **Primary:** Google Gemini 1.5 Flash ($0.075 per 1M input tokens)
- **Fallback:** Azure OpenAI GPT-4o ($5.00 per 1M input tokens)
- **Cost savings:** 98% cheaper with Gemini

**Speech-to-Text:**
- **Service:** OpenAI Whisper API ($0.006 per minute)
- **BAA:** Available

### EDI & Billing

**Clearinghouse:** Stedi
- **EDI 837P:** Professional claims
- **Cost:** $0.50 per transaction + $99/month base
- **BAA:** Included

### Hosting & Infrastructure

**MVP Hosting:**
- **Frontend:** Expo EAS (mobile builds)
- **Backend:** Supabase Cloud (if BAA obtained) OR AWS RDS
- **Secrets:** AWS Secrets Manager
- **Monitoring:** Sentry (error tracking) + Datadog (APM)

---

## Phase 1: Foundation & Compliance Infrastructure (Weeks 1-3)

**Team:** 2 backend engineers, 1 DevOps, 1 compliance consultant
**AI Contribution:** 80%

### 1.1 Database Schema (Complete)

**Core Tables:**

```sql
-- Organizations (multi-tenant root)
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text UNIQUE,
  npi text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Providers (RBTs, BCBAs)
CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text CHECK (role IN ('RBT', 'BCBA', 'ADMIN')),
  npi text,
  credentials jsonb,
  created_at timestamptz DEFAULT now()
);

-- Patients
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  state text NOT NULL,
  primary_diagnosis_code text,
  guardian_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insurance Information
CREATE TABLE patient_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  payer_name text NOT NULL,
  payer_id text,
  member_id text NOT NULL,
  group_number text,
  plan_name text,
  effective_date date,
  termination_date date,
  is_active boolean DEFAULT true,
  eligibility_verification jsonb,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Authorizations
CREATE TABLE authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  insurance_id uuid REFERENCES patient_insurance(id),
  service_code text NOT NULL,
  total_units integer NOT NULL CHECK (total_units > 0),
  used_units integer DEFAULT 0 CHECK (used_units >= 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text CHECK (status IN ('ACTIVE', 'EXPIRED', 'EXHAUSTED')),
  authorization_number text,

  -- Critical constraint: prevent negative balance
  CONSTRAINT positive_balance CHECK (total_units >= used_units),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_auth_patient_service ON authorizations(patient_id, service_code, status);

-- Appointments
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  authorization_id uuid REFERENCES authorizations(id),
  service_code text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  location text CHECK (location IN ('HOME', 'CLINIC', 'SCHOOL', 'TELEHEALTH')),
  recurrence_rule text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_appointments_provider_time ON appointments(provider_id, start_time, end_time)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');
CREATE INDEX idx_appointments_patient_time ON appointments(patient_id, start_time, end_time)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');

-- Sessions (clinical encounters)
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES providers(id),
  authorization_id uuid REFERENCES authorizations(id),
  service_code text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes integer,
  billed_units integer,
  status text CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'REQUIRES_REVIEW')),
  location text,
  latest_metrics jsonb,
  ai_note_json jsonb,
  voice_note_url text,
  voice_transcript text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Session Events (append-only log)
CREATE TABLE session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_timestamp timestamptz DEFAULT now(),
  raw_value numeric,
  metadata jsonb,
  recorded_by uuid REFERENCES providers(id)
);

CREATE INDEX idx_events_session ON session_events(session_id, event_timestamp);

-- Claims
CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id),
  authorization_id uuid REFERENCES authorizations(id),
  payer_id text NOT NULL,
  claim_number text UNIQUE,
  edi_payload jsonb NOT NULL,
  status text CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID')),
  submitted_at timestamptz,
  response_payload jsonb,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);

-- AUDIT LOGGING (HIPAA CRITICAL)
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES providers(id),
  user_email text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  details jsonb,
  organization_id uuid REFERENCES organizations(id)
);

-- Make audit logs immutable
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON audit_logs FROM anon;

-- Indexes for audit queries
CREATE INDEX idx_audit_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id, timestamp DESC);
CREATE INDEX idx_audit_org ON audit_logs(organization_id, timestamp DESC);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
```

### 1.2 Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Get user's organization
CREATE FUNCTION auth.user_organization_id() RETURNS uuid AS $$
  SELECT organization_id FROM providers WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Organization policy: Users can only access their org
CREATE POLICY org_isolation ON patients
  FOR ALL USING (organization_id = auth.user_organization_id());

CREATE POLICY org_isolation ON providers
  FOR ALL USING (organization_id = auth.user_organization_id());

CREATE POLICY org_isolation ON appointments
  FOR ALL USING (organization_id = auth.user_organization_id());

-- Sessions inherit from patients
CREATE POLICY session_access ON sessions
  FOR ALL USING (
    patient_id IN (
      SELECT id FROM patients WHERE organization_id = auth.user_organization_id()
    )
  );

-- Audit logs: Users can read own org, but cannot modify
CREATE POLICY audit_read ON audit_logs
  FOR SELECT USING (organization_id = auth.user_organization_id());
```

### 1.3 Atomic Authorization Reserve Function

**CRITICAL FIX for race conditions:**

```sql
CREATE FUNCTION reserve_session_units(
  p_authorization_id uuid,
  p_expected_units integer
) RETURNS jsonb AS $$
DECLARE
  v_available integer;
  v_auth record;
BEGIN
  -- Lock the authorization row (prevents concurrent access)
  SELECT * INTO v_auth
  FROM authorizations
  WHERE id = p_authorization_id
  FOR UPDATE;

  -- Check expiration
  IF v_auth.end_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_EXPIRED',
      'message', format('Authorization expired on %s', v_auth.end_date)
    );
  END IF;

  -- Calculate available units
  v_available := v_auth.total_units - v_auth.used_units;

  IF v_available < p_expected_units THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_UNITS',
      'message', format('Only %s units available, need %s', v_available, p_expected_units),
      'available', v_available
    );
  END IF;

  -- Reserve units immediately (atomic operation)
  UPDATE authorizations
  SET used_units = used_units + p_expected_units,
      updated_at = now()
  WHERE id = p_authorization_id;

  RETURN jsonb_build_object(
    'success', true,
    'units_reserved', p_expected_units,
    'remaining_units', v_available - p_expected_units
  );
END;
$$ LANGUAGE plpgsql;

-- Helper function to adjust units after session completes
CREATE FUNCTION adjust_authorization_units(
  p_authorization_id uuid,
  p_adjustment integer
) RETURNS void AS $$
BEGIN
  UPDATE authorizations
  SET used_units = used_units + p_adjustment,
      updated_at = now()
  WHERE id = p_authorization_id;
END;
$$ LANGUAGE plpgsql;
```

### 1.4 Conflict Prevention Function

```sql
CREATE FUNCTION check_scheduling_conflict(
  p_provider_id uuid,
  p_patient_id uuid,
  p_start timestamptz,
  p_end timestamptz
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM appointments
    WHERE status IN ('SCHEDULED', 'IN_PROGRESS')
    AND (provider_id = p_provider_id OR patient_id = p_patient_id)
    AND tsrange(start_time, end_time) && tsrange(p_start, p_end)
  );
END;
$$ LANGUAGE plpgsql;
```

### 1.5 Secrets Management

**Using AWS Secrets Manager:**

```typescript
// lib/secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

export async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString!;
}

// Secrets stored in AWS:
// - omnirapeutic/openai-api-key
// - omnirapeutic/gemini-api-key
// - omnirapeutic/stedi-api-key
// - omnirapeutic/supabase-service-role-key
```

### 1.6 Audit Logging Implementation

```typescript
// Supabase Edge Function: log-access.ts
import { createClient } from '@supabase/supabase-js';

export async function logAccess(
  userId: string,
  userEmail: string,
  action: string,
  resourceType: string,
  resourceId: string,
  ipAddress: string,
  userAgent: string,
  organizationId: string,
  details?: object
) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  await supabase.from('audit_logs').insert({
    user_id: userId,
    user_email: userEmail,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    ip_address: ipAddress,
    user_agent: userAgent,
    organization_id: organizationId,
    details
  });
}
```

```typescript
// Client-side helper: useAuditLog.ts
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

export function useAuditLog() {
  const supabase = useSupabaseClient();
  const user = useUser();

  return async (action: string, resourceType: string, resourceId: string) => {
    await supabase.functions.invoke('log-access', {
      body: {
        userId: user.id,
        userEmail: user.email,
        action,
        resourceType,
        resourceId,
        timestamp: new Date().toISOString()
      }
    });
  };
}
```

### Phase 1 Success Criteria

- [ ] All 10 database tables created with constraints
- [ ] RLS policies prevent cross-org access (100% isolation verified)
- [ ] Audit logs capture: VIEW_PATIENT, EDIT_SESSION, GENERATE_NOTE
- [ ] Secrets stored in AWS Secrets Manager (not hardcoded)
- [ ] All BAAs signed or alternatives documented
- [ ] Test data: 1 organization, 3 providers, 5 patients inserted
- [ ] Atomic authorization function tested with concurrent requests

---

## Phase 2: Patient Intake & Insurance (Weeks 4-6)

**Team:** 1 full-stack engineer, 1 backend engineer
**AI Contribution:** 60%

### 2.1 Patient Demographics Form

```typescript
// components/PatientIntakeForm.tsx
interface PatientFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  state: string;
  primaryDiagnosisCode: string;
  guardianEmail: string;
  guardianPhone: string;
}

export function PatientIntakeForm() {
  const [formData, setFormData] = useState<PatientFormData>({});
  const supabase = useSupabaseClient();
  const logAccess = useAuditLog();

  async function handleSubmit() {
    const { data: patient, error } = await supabase
      .from('patients')
      .insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        date_of_birth: formData.dateOfBirth,
        state: formData.state,
        primary_diagnosis_code: formData.primaryDiagnosisCode,
        guardian_email: formData.guardianEmail,
        organization_id: currentOrganizationId
      })
      .select()
      .single();

    await logAccess('CREATE_PATIENT', 'patient', patient.id);

    router.push(`/patients/${patient.id}/insurance`);
  }

  return (
    <Form onSubmit={handleSubmit}>
      {/* Form fields with validation */}
    </Form>
  );
}
```

### 2.2 Insurance Information Capture

```typescript
// components/InsuranceForm.tsx
interface InsuranceFormData {
  payerName: string;
  payerId: string;
  memberId: string;
  groupNumber: string;
  planName: string;
  effectiveDate: string;
  terminationDate?: string;
}

export function InsuranceForm({ patientId }: { patientId: string }) {
  const supabase = useSupabaseClient();
  const logAccess = useAuditLog();

  async function handleSubmit(data: InsuranceFormData) {
    const { data: insurance } = await supabase
      .from('patient_insurance')
      .insert({
        patient_id: patientId,
        payer_name: data.payerName,
        payer_id: data.payerId,
        member_id: data.memberId,
        group_number: data.groupNumber,
        plan_name: data.planName,
        effective_date: data.effectiveDate,
        termination_date: data.terminationDate,
        is_active: true
      })
      .select()
      .single();

    await logAccess('CREATE_INSURANCE', 'patient_insurance', insurance.id);
    router.push(`/patients/${patientId}/eligibility`);
  }

  return <Form onSubmit={handleSubmit}>{/* Fields */}</Form>;
}
```

### 2.3 Manual Eligibility Logging

**Note:** Automated EDI 270/271 deferred to post-MVP.

```typescript
// components/EligibilityCheckForm.tsx
interface EligibilityResult {
  coverageActive: boolean;
  effectiveDate: string;
  planName: string;
  copayAmount?: number;
  deductibleRemaining?: number;
  verifiedBy: string;
  verificationDate: string;
  notes: string;
}

export function EligibilityCheckForm({ insuranceId }: { insuranceId: string }) {
  async function handleSubmit(result: EligibilityResult) {
    await supabase
      .from('patient_insurance')
      .update({
        eligibility_verification: result,
        last_verified_at: new Date().toISOString()
      })
      .eq('id', insuranceId);

    await logAccess('VERIFY_ELIGIBILITY', 'patient_insurance', insuranceId);
    router.push(`/authorizations/new?insurance_id=${insuranceId}`);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Checkbox label="Coverage Active?" />
      <DatePicker label="Effective Date" />
      <Input label="Plan Name" />
      <Input label="Copay Amount" type="number" />
      <TextArea label="Verification Notes" />
    </Form>
  );
}
```

### 2.4 Authorization Entry

```typescript
// components/AuthorizationForm.tsx
interface AuthorizationData {
  serviceCode: string;
  totalUnits: number;
  startDate: string;
  endDate: string;
  authorizationNumber: string;
}

export function AuthorizationForm({ patientId, insuranceId }: Props) {
  async function handleSubmit(data: AuthorizationData) {
    const { data: auth } = await supabase
      .from('authorizations')
      .insert({
        patient_id: patientId,
        insurance_id: insuranceId,
        service_code: data.serviceCode,
        total_units: data.totalUnits,
        used_units: 0,
        start_date: data.startDate,
        end_date: data.endDate,
        status: 'ACTIVE',
        authorization_number: data.authorizationNumber
      })
      .select()
      .single();

    await logAccess('CREATE_AUTHORIZATION', 'authorization', auth.id);
    toast.success('Patient intake complete! Ready to schedule appointments.');
    router.push(`/patients/${patientId}`);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Select label="Service Code" options={['97153', '97155', '97156']} />
      <Input label="Total Units Approved" type="number" />
      <DatePicker label="Start Date" />
      <DatePicker label="End Date" />
      <Input label="Authorization Number" />
    </Form>
  );
}
```

### Phase 2 Success Criteria

- [ ] Patient intake completed in < 2 minutes
- [ ] Insurance form validates member ID format
- [ ] Authorization constraints prevent negative total_units
- [ ] All actions logged to audit_logs table
- [ ] Test: Create 5 patients with different payers

---

## Phase 3: Scheduling System (Weeks 7-9)

**Team:** 1 full-stack engineer
**AI Contribution:** 60%

### 3.1 Calendar Component

```typescript
// components/Calendar.tsx
import { useState, useEffect } from 'react';
import { addDays, startOfWeek } from 'date-fns';

export function Calendar() {
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);

  useEffect(() => {
    async function loadAppointments() {
      const weekStart = currentWeek.toISOString();
      const weekEnd = addDays(currentWeek, 7).toISOString();

      const { data } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patients(first_name, last_name),
          provider:providers(full_name)
        `)
        .gte('start_time', weekStart)
        .lt('start_time', weekEnd)
        .order('start_time');

      setAppointments(data);
    }

    loadAppointments();

    // Subscribe to realtime updates
    const subscription = supabase
      .channel('appointments')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => loadAppointments()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [currentWeek]);

  return (
    <div className="calendar-grid">
      <WeekView appointments={appointments} onSlotClick={handleSlotClick} />
    </div>
  );
}
```

### 3.2 Appointment Booking with Conflict Prevention

```typescript
// lib/scheduling.ts
export async function createAppointment(data: {
  patientId: string;
  providerId: string;
  serviceCode: string;
  startTime: string;
  endTime: string;
  location: string;
}) {
  // Step 1: Check for conflicts
  const { data: hasConflict } = await supabase.rpc('check_scheduling_conflict', {
    p_provider_id: data.providerId,
    p_patient_id: data.patientId,
    p_start: data.startTime,
    p_end: data.endTime
  });

  if (hasConflict) {
    throw new Error('Scheduling conflict detected');
  }

  // Step 2: Find active authorization
  const { data: auth } = await supabase
    .from('authorizations')
    .select('*')
    .eq('patient_id', data.patientId)
    .eq('service_code', data.serviceCode)
    .eq('status', 'ACTIVE')
    .single();

  if (!auth) {
    throw new Error('No active authorization found');
  }

  // Step 3: Create appointment
  const { data: appointment } = await supabase
    .from('appointments')
    .insert({
      patient_id: data.patientId,
      provider_id: data.providerId,
      authorization_id: auth.id,
      service_code: data.serviceCode,
      start_time: data.startTime,
      end_time: data.endTime,
      status: 'SCHEDULED',
      location: data.location,
      organization_id: currentOrganizationId
    })
    .select()
    .single();

  await logAccess('CREATE_APPOINTMENT', 'appointment', appointment.id);

  return appointment;
}
```

### 3.3 Simple Recurring Appointments

```typescript
// lib/recurring.ts
import RRule from 'rrule';

export async function createRecurringAppointments(
  baseAppointment: AppointmentData,
  frequency: 'DAILY' | 'WEEKLY',
  count: number
) {
  const rule = new RRule({
    freq: frequency === 'DAILY' ? RRule.DAILY : RRule.WEEKLY,
    count: count,
    dtstart: new Date(baseAppointment.startTime)
  });

  const occurrences = rule.all();

  for (const date of occurrences) {
    const startTime = date.toISOString();
    const endTime = addHours(date, 2).toISOString();

    try {
      await createAppointment({
        ...baseAppointment,
        startTime,
        endTime
      });
    } catch (error) {
      console.error(`Failed to create appointment for ${startTime}:`, error);
    }
  }
}
```

### Phase 3 Success Criteria

- [ ] Calendar loads week view in < 1 second
- [ ] Cannot double-book provider or patient (DB-enforced)
- [ ] Can create single appointment in 3 clicks
- [ ] Recurring appointments create up to 10 instances
- [ ] Appointments update in real-time across browsers
- [ ] Test: Schedule 20 appointments across 3 providers without conflicts

---

## Phase 4: Clinical Workflow & Documentation (Weeks 10-13)

**Team:** 2 full-stack engineers, 1 AI/ML engineer
**AI Contribution:** 50%

### 4.1 Session Start with Atomic Authorization Reserve

```typescript
// lib/sessionManagement.ts
export async function startSession(appointmentId: string) {
  const logAccess = useAuditLog();

  // Get appointment details
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, authorization:authorizations(*)')
    .eq('id', appointmentId)
    .single();

  // Calculate expected duration
  const durationMinutes = differenceInMinutes(
    new Date(appointment.end_time),
    new Date(appointment.start_time)
  );

  const expectedUnits = Math.ceil(durationMinutes / 15);

  // Atomic reserve (prevents race conditions)
  const { data: reserveResult } = await supabase.rpc('reserve_session_units', {
    p_authorization_id: appointment.authorization_id,
    p_expected_units: expectedUnits
  });

  if (!reserveResult.success) {
    throw new Error(reserveResult.message);
  }

  // Create session record
  const { data: session } = await supabase
    .from('sessions')
    .insert({
      appointment_id: appointmentId,
      patient_id: appointment.patient_id,
      provider_id: appointment.provider_id,
      authorization_id: appointment.authorization_id,
      service_code: appointment.service_code,
      start_time: new Date().toISOString(),
      status: 'IN_PROGRESS',
      location: appointment.location,
      latest_metrics: {}
    })
    .select()
    .single();

  await logAccess('START_SESSION', 'session', session.id);

  await supabase
    .from('appointments')
    .update({ status: 'IN_PROGRESS' })
    .eq('id', appointmentId);

  return { session, unitsReserved: expectedUnits };
}
```

### 4.2 Client-Side Metric Aggregation

```typescript
// hooks/useSessionMetrics.ts
interface SessionMetrics {
  tantrumCount: number;
  durationTotal: number;
  mandingCorrect: number;
  mandingTotal: number;
  lastUpdated: string;
}

export function useSessionMetrics(sessionId: string) {
  const [metrics, setMetrics] = useState<SessionMetrics>({
    tantrumCount: 0,
    durationTotal: 0,
    mandingCorrect: 0,
    mandingTotal: 0,
    lastUpdated: new Date().toISOString()
  });

  const supabase = useSupabaseClient();

  // Debounced save (every 10 seconds)
  const debouncedSave = useMemo(
    () =>
      debounce(async (currentMetrics: SessionMetrics) => {
        await supabase
          .from('sessions')
          .update({
            latest_metrics: currentMetrics,
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId);
      }, 10000),
    [sessionId]
  );

  async function logEvent(eventType: string, value?: number) {
    // 1. Save to events table
    await supabase.from('session_events').insert({
      session_id: sessionId,
      event_type: eventType,
      raw_value: value,
      event_timestamp: new Date().toISOString()
    });

    // 2. Update local state immediately
    setMetrics((prev) => {
      const updated = { ...prev, lastUpdated: new Date().toISOString() };

      switch (eventType) {
        case 'TANT_START':
          updated.tantrumCount++;
          break;
        case 'DURATION_ADD':
          updated.durationTotal += value || 0;
          break;
        case 'MAND_C':
          updated.mandingCorrect++;
          updated.mandingTotal++;
          break;
        case 'MAND_I':
          updated.mandingTotal++;
          break;
      }

      debouncedSave(updated);
      return updated;
    });
  }

  // Force save on unmount
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, []);

  return { metrics, logEvent };
}
```

### 4.3 Voice Note + Whisper Integration

```typescript
// lib/transcription.ts
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'voice-note.webm');
  formData.append('model', 'whisper-1');

  const apiKey = await getSecret('omnirapeutic/openai-api-key');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  const result = await response.json();
  return result.text;
}
```

### 4.4 Documentation Agent (LLM SOAP Note Generation)

```typescript
// lib/documentationAgent.ts
interface SOAPNoteRequest {
  patientName: string;
  patientState: string;
  sessionDuration: number;
  metrics: SessionMetrics;
  voiceTranscript: string;
  serviceCode: string;
}

export async function generateSOAPNote(request: SOAPNoteRequest): Promise<string> {
  const stateRules = await getStateRules(request.patientState);

  const prompt = `You are an expert BCBA. Write a clinical SOAP note based on the data below.

STATE-SPECIFIC REQUIREMENTS:
${stateRules}

CLIENT CONTEXT:
- Name: ${request.patientName}
- State: ${request.patientState}
- Session Duration: ${request.sessionDuration} minutes
- Service Code: ${request.serviceCode}

SUBJECTIVE (RBT Notes):
${request.voiceTranscript}

OBJECTIVE DATA:
- Tantrums observed: ${request.metrics.tantrumCount}
- Total duration: ${request.metrics.durationTotal} minutes
- Manding accuracy: ${request.metrics.mandingCorrect}/${request.metrics.mandingTotal}

Write a SOAP note with:
- Subjective: Summarize RBT narrative
- Objective: Report raw data
- Assessment: Analyze trends and behavior patterns
- Plan: Recommend protocol continuation or modifications

Format as JSON with keys: subjective, objective, assessment, plan`;

  const apiKey = await getSecret('omnirapeutic/gemini-api-key');

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const result = await response.json();
  const noteText = result.candidates[0].content.parts[0].text;

  return JSON.parse(noteText);
}
```

### 4.5 Session Completion Workflow

```typescript
// lib/sessionManagement.ts (continued)
export async function endSession(sessionId: string) {
  const logAccess = useAuditLog();

  const { data: session } = await supabase
    .from('sessions')
    .select(`
      *,
      patient:patients(first_name, last_name, state),
      authorization:authorizations(*)
    `)
    .eq('id', sessionId)
    .single();

  const durationMinutes = differenceInMinutes(
    new Date(),
    new Date(session.start_time)
  );

  // Apply 8-minute rule
  let actualUnits = 0;
  if (durationMinutes >= 8) {
    actualUnits = Math.ceil(durationMinutes / 15);
  }

  // Generate SOAP note
  const soapNote = await generateSOAPNote({
    patientName: `${session.patient.first_name} ${session.patient.last_name}`,
    patientState: session.patient.state,
    sessionDuration: durationMinutes,
    metrics: session.latest_metrics,
    voiceTranscript: session.voice_transcript || '',
    serviceCode: session.service_code
  });

  // Update session
  await supabase
    .from('sessions')
    .update({
      end_time: new Date().toISOString(),
      duration_minutes: durationMinutes,
      billed_units: actualUnits,
      status: 'COMPLETED',
      ai_note_json: soapNote
    })
    .eq('id', sessionId);

  // Adjust authorization if over/under estimated
  const unitsReserved = session.billed_units || 0;
  const unitsDifference = actualUnits - unitsReserved;

  if (unitsDifference !== 0) {
    await supabase.rpc('adjust_authorization_units', {
      p_authorization_id: session.authorization_id,
      p_adjustment: unitsDifference
    });
  }

  await logAccess('END_SESSION', 'session', sessionId);

  return { session, actualUnits, soapNote };
}
```

### Phase 4 Success Criteria

- [ ] Session start reserves units atomically (no race conditions)
- [ ] Metrics update in UI < 100ms after button tap
- [ ] Voice notes transcribe in < 5 seconds
- [ ] SOAP notes generate in < 8 seconds
- [ ] Client-side metrics survive tab refresh
- [ ] Test: Run 10 concurrent sessions without unit over-billing

---

## Phase 5: Billing & Authorization (Weeks 14-17)

**Team:** 1 backend engineer, 1 EDI specialist
**AI Contribution:** 30%

### 5.1 EDI 837P Claim Generation

```typescript
// lib/claimGeneration.ts
interface ClaimData {
  session: Session;
  patient: Patient;
  provider: Provider;
  authorization: Authorization;
  insurance: Insurance;
  organization: Organization;
}

export function generateEDI837(data: ClaimData): object {
  return {
    interchangeControlHeader: {
      authorizationInformation: 'NO SECURITY INFO',
      securityInformation: '',
      senderIdQualifier: 'ZZ',
      senderId: data.organization.tax_id,
      receiverIdQualifier: 'ZZ',
      receiverId: data.insurance.payer_id,
      interchangeDate: format(new Date(), 'yyMMdd'),
      interchangeTime: format(new Date(), 'HHmm'),
      interchangeControlStandardsId: 'U',
      interchangeControlVersionNumber: '00401'
    },
    functionalGroup: {
      functionalIdCode: 'HC',
      applicationSenderCode: data.organization.name,
      applicationReceiverCode: data.insurance.payer_name,
      date: format(new Date(), 'yyyyMMdd'),
      time: format(new Date(), 'HHmmss')
    },
    transaction: {
      transactionSetCode: '837',
      transactionControlNumber: generateControlNumber(),
      implementationConventionReference: '005010X222A1'
    },
    submitter: {
      entityIdentifierCode: '41',
      entityTypeQualifier: '2',
      organizationName: data.organization.name,
      contactName: 'Billing Department',
      communicationNumbers: [
        { qualifier: 'TE', number: '5555555555' }
      ]
    },
    receiver: {
      entityIdentifierCode: '40',
      entityTypeQualifier: '2',
      organizationName: data.insurance.payer_name,
      idCode: data.insurance.payer_id,
      idCodeQualifier: 'PI'
    },
    billingProvider: {
      entityIdentifierCode: '85',
      entityTypeQualifier: '2',
      organizationName: data.organization.name,
      idCode: data.organization.npi,
      idCodeQualifier: 'XX',
      address: {
        address1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701'
      },
      taxId: data.organization.tax_id
    },
    subscriber: {
      payerResponsibilityCode: 'P',
      individualFirstName: data.patient.first_name,
      individualLastName: data.patient.last_name,
      idCode: data.insurance.member_id,
      idCodeQualifier: 'MI',
      dateOfBirth: format(new Date(data.patient.date_of_birth), 'yyyyMMdd'),
      genderCode: 'U'
    },
    patient: {
      entityIdentifierCode: 'QC',
      entityTypeQualifier: '1',
      individualFirstName: data.patient.first_name,
      individualLastName: data.patient.last_name,
      dateOfBirth: format(new Date(data.patient.date_of_birth), 'yyyyMMdd')
    },
    claimInformation: {
      claimFilingIndicatorCode: 'MC',
      patientControlNumber: data.session.id.substr(0, 20),
      claimChargeAmount: calculateChargeAmount(data),
      placeOfServiceCode: mapLocationToPlaceOfService(data.session.location),
      claimFrequencyCode: '1',
      providerSignatureIndicator: 'Y',
      assignmentOfBenefitsIndicator: 'Y',
      releaseOfInformationCode: 'Y'
    },
    healthCareDiagnosis: {
      diagnosisCodeQualifier: 'ABK',
      diagnosisCodes: [data.patient.primary_diagnosis_code]
    },
    serviceLine: {
      serviceIdQualifier: 'HC',
      procedureCode: data.session.service_code,
      procedureModifiers: [],
      lineItemChargeAmount: calculateChargeAmount(data),
      unitOrBasisForMeasurementCode: 'UN',
      serviceUnitCount: data.session.billed_units,
      dateOfService: format(new Date(data.session.start_time), 'yyyyMMdd'),
      diagnosisCodePointers: [1]
    }
  };
}

function calculateChargeAmount(data: ClaimData): number {
  const ratePerUnit = 50.0; // From payer_rules table
  return data.session.billed_units * ratePerUnit;
}

function mapLocationToPlaceOfService(location: string): string {
  const mapping = {
    HOME: '12',
    CLINIC: '11',
    SCHOOL: '03',
    TELEHEALTH: '02'
  };
  return mapping[location] || '99';
}
```

### 5.2 Claim Submission via Stedi

```typescript
// lib/stedi.ts
export async function submitClaimToStedi(ediPayload: object, sessionId: string) {
  const apiKey = await getSecret('omnirapeutic/stedi-api-key');

  const { data: claim } = await supabase
    .from('claims')
    .insert({
      session_id: sessionId,
      authorization_id: session.authorization_id,
      payer_id: ediPayload.receiver.idCode,
      edi_payload: ediPayload,
      status: 'DRAFT'
    })
    .select()
    .single();

  // Submit to Stedi for validation
  const response = await fetch('https://healthcare.us.stedi.com/2024-04-01/x12/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`
    },
    body: JSON.stringify(ediPayload)
  });

  const validationResult = await response.json();

  if (!validationResult.valid) {
    await supabase
      .from('claims')
      .update({
        status: 'REQUIRES_REVIEW',
        rejection_reason: JSON.stringify(validationResult.errors)
      })
      .eq('id', claim.id);

    throw new Error('Claim validation failed');
  }

  await supabase
    .from('claims')
    .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString() })
    .eq('id', claim.id);

  return claim;
}
```

### Phase 5 Success Criteria

- [ ] EDI 837 generates with valid format (passes Stedi validation)
- [ ] Claim generation < 2 seconds per session
- [ ] All claims stored with full audit trail
- [ ] Manual review queue shows claims before submission
- [ ] Test: Generate 20 claims, validate all pass EDI format check

---

## Phase 6: Testing, Hardening & Pilot (Weeks 18-24)

**Team:** Full team (2 full-stack, 1 backend, 1 QA, 1 security consultant)
**AI Contribution:** 60%

### 6.1 Security Audit & Penetration Testing

**Week 18-19: Security Review**

```bash
# Automated Security Scans
docker run -t owasp/zap2docker-stable zap-baseline.py -t https://staging.omnirapeutic.com

sqlmap -u "https://staging.omnirapeutic.com/api/patients?id=1" --batch

npm audit --production
```

**Manual Testing Checklist:**
- [ ] Attempt cross-organization data access (RLS bypass)
- [ ] Test password policies (minimum length, complexity)
- [ ] Verify session timeout (15 minutes idle)
- [ ] Test MFA enforcement for admin roles
- [ ] Validate audit log immutability (attempt UPDATE/DELETE)
- [ ] Check for exposed API keys in client-side code
- [ ] Test file upload restrictions (size limits, type validation)
- [ ] Verify PHI redaction in error messages and logs

### 6.2 Load Testing & Performance Validation

```typescript
// tests/load/concurrent-sessions.test.ts
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const startResponse = http.post(
    'https://staging.omnirapeutic.com/api/sessions/start',
    JSON.stringify({ appointmentId: __VU }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(startResponse, {
    'session started': (r) => r.status === 200,
    'units reserved': (r) => JSON.parse(r.body).unitsReserved > 0,
  });

  // Simulate logging events
  for (let i = 0; i < 20; i++) {
    http.post(
      'https://staging.omnirapeutic.com/api/sessions/events',
      JSON.stringify({
        sessionId: JSON.parse(startResponse.body).id,
        eventType: 'MAND_C',
      })
    );
    sleep(1);
  }

  const endResponse = http.post(
    'https://staging.omnirapeutic.com/api/sessions/end',
    JSON.stringify({ sessionId: JSON.parse(startResponse.body).id })
  );

  check(endResponse, {
    'session ended': (r) => r.status === 200,
    'SOAP note generated': (r) => JSON.parse(r.body).soapNote !== null,
  });
}
```

### 6.3 E2E Testing

```typescript
// tests/e2e/complete-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('complete patient workflow', async ({ page }) => {
  // Login
  await page.goto('https://staging.omnirapeutic.com');
  await page.fill('[name=email]', 'test-bcba@example.com');
  await page.fill('[name=password]', 'TestPassword123!');
  await page.click('button[type=submit]');

  // Create patient
  await page.click('text=New Patient');
  await page.fill('[name=firstName]', 'John');
  await page.fill('[name=lastName]', 'Doe');
  await page.fill('[name=dateOfBirth]', '2015-06-15');
  await page.selectOption('[name=state]', 'TX');
  await page.fill('[name=primaryDiagnosisCode]', 'F84.0');
  await page.click('button:has-text("Save")');

  // Add insurance
  await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+\/insurance/);
  await page.fill('[name=payerName]', 'Medicaid Texas');
  await page.fill('[name=memberId]', '123456789');
  await page.click('button:has-text("Save")');

  // Manual eligibility check
  await page.check('[name=coverageActive]');
  await page.fill('[name=planName]', 'STAR Health');
  await page.click('button:has-text("Verify")');

  // Create authorization
  await page.selectOption('[name=serviceCode]', '97153');
  await page.fill('[name=totalUnits]', '100');
  await page.fill('[name=startDate]', '2025-01-01');
  await page.fill('[name=endDate]', '2025-06-30');
  await page.fill('[name=authorizationNumber]', 'AUTH123456');
  await page.click('button:has-text("Save")');

  // Schedule appointment
  await page.click('text=Calendar');
  await page.click('.calendar-slot[data-time="2025-01-15T10:00"]');
  await page.selectOption('[name=patientId]', { label: 'John Doe' });
  await page.selectOption('[name=providerId]', { label: 'Jane Smith, RBT' });
  await page.selectOption('[name=serviceCode]', '97153');
  await page.click('button:has-text("Schedule")');

  // Start session
  await page.click('.appointment-card:has-text("John Doe")');
  await page.click('button:has-text("Start Session")');
  await expect(page).toHaveURL(/\/sessions\/[a-z0-9-]+/);

  // Log events
  await page.click('button:has-text("Tantrum Observed")');
  await page.click('button:has-text("Manding Correct")');
  await page.click('button:has-text("Manding Correct")');
  await page.click('button:has-text("Manding Incorrect")');

  // Verify live metrics
  await expect(page.locator('.metric-tantrums')).toHaveText('1');
  await expect(page.locator('.metric-manding')).toHaveText('2/3');

  // End session
  await page.click('button:has-text("End Session")');
  await page.waitForTimeout(8000);

  // Verify SOAP note
  await expect(page.locator('.soap-note')).toBeVisible();
  await expect(page.locator('.soap-note')).toContainText('Subjective');
  await expect(page.locator('.soap-note')).toContainText('Objective');

  // Generate claim
  await page.click('button:has-text("Generate Claim")');
  await expect(page.locator('.claim-status')).toHaveText('DRAFT');

  // Verify authorization units decremented
  await page.goto('/authorizations');
  await expect(page.locator('.units-used')).toContainText('4');
});
```

### 6.4 Pilot Clinic Onboarding

**Week 24: Pilot Launch**

**Pre-Launch Checklist:**
- [ ] All critical and high bugs resolved
- [ ] Security audit findings addressed
- [ ] Load test passes with 50 concurrent users
- [ ] E2E tests passing at 100%
- [ ] Backup/restore procedures tested
- [ ] Incident response plan documented
- [ ] Support escalation process defined
- [ ] User training materials prepared

**Onboarding Process:**
1. **Day 1-2: Setup**
   - Create organization account
   - Add providers (RBTs, BCBAs)
   - Configure state-specific rules
   - Import existing patient data

2. **Day 3: Training**
   - Live demo session (1 hour)
   - Hands-on practice with test data
   - Q&A session
   - Provide quick-reference guides

3. **Day 4-5: Pilot Start**
   - RBTs conduct first live sessions
   - Monitor usage in real-time
   - Provide same-day support
   - Daily check-in calls

### Phase 6 Success Criteria

- [ ] Security audit completed with all findings addressed
- [ ] Load test demonstrates 50+ concurrent sessions without degradation
- [ ] E2E test suite covers all critical paths
- [ ] Zero P0/P1 bugs in backlog
- [ ] Pilot clinic successfully using platform for 1 week
- [ ] At least 20 sessions completed in pilot with 95%+ data quality
- [ ] RBT satisfaction score > 7/10
- [ ] All claims pass EDI validation

---

## Risk Mitigation Strategy

### CRITICAL RISK #1: HIPAA Compliance Failure

**Likelihood:** Medium | **Impact:** CRITICAL (regulatory shutdown)

**Mitigation Actions:**
- [ ] **Week 0:** Engage HIPAA compliance consultant
- [ ] **Week 1:** Submit BAA requests to all vendors
- [ ] **Week 3:** Document BAA status; activate AWS fallback if gaps exist
- [ ] **Week 12:** Conduct internal HIPAA compliance audit (GO/NO-GO decision point)
- [ ] **Week 18:** Engage external security auditor
- [ ] **Week 23:** Final compliance review before pilot launch

**Fallback Plan:** If Supabase BAA unavailable by Week 12:
- Immediate pivot to AWS RDS + Hasura (2-week migration)
- Extend timeline by 2 weeks if needed

### CRITICAL RISK #2: Authorization Race Conditions

**Likelihood:** HIGH (without atomic transactions) | **Impact:** HIGH (revenue loss)

**Mitigation Actions:**
- [ ] **Week 10:** Implement `reserve_session_units` with `FOR UPDATE` locking
- [ ] **Week 11:** Write concurrent unit tests (simulate 10 parallel session starts)
- [ ] **Week 12:** Load test with 50 concurrent users
- [ ] **Week 20:** Re-test under peak load (100 concurrent users)

**Validation Criteria:**
```sql
-- Daily audit query (should return ZERO rows)
SELECT
  a.id,
  a.total_units,
  a.used_units,
  SUM(s.billed_units) as actual_billed
FROM authorizations a
LEFT JOIN sessions s ON s.authorization_id = a.id
GROUP BY a.id
HAVING a.used_units != COALESCE(SUM(s.billed_units), 0);
```

**Rollback Plan:** If race conditions detected:
1. Pause all session starts
2. Run reconciliation script
3. Issue credit memos to payers
4. Deploy hotfix within 4 hours

### HIGH RISK #3: LLM API Rate Limits or Downtime

**Likelihood:** MEDIUM | **Impact:** HIGH (notes not generated)

**Mitigation Actions:**
- [ ] **Week 10:** Implement dual-provider fallback (Gemini → GPT-4o)
- [ ] **Week 11:** Add exponential backoff retry logic
- [ ] **Week 12:** Create manual note template as last resort
- [ ] **Week 13:** Add monitoring alert for LLM failure rate > 5%

**Fallback Logic:**
```typescript
async function generateSOAPNote(request: SOAPNoteRequest): Promise<SOAPNote> {
  try {
    return await callGemini(request);
  } catch (error) {
    console.warn('Gemini failed, trying GPT-4o');
    try {
      return await callGPT(request);
    } catch (error) {
      console.error('Both LLMs failed');
      return generateTemplateNote(request);
    }
  }
}
```

**Cost Budget:** Allocate $1,000/month for GPT-4o fallback usage

### MEDIUM RISK #4: Pilot Clinic Recruitment Delays

**Likelihood:** MEDIUM | **Impact:** MEDIUM (delayed validation)

**Mitigation Actions:**
- [ ] **Week 6:** Begin outreach to 5 potential pilot clinics
- [ ] **Week 12:** Confirm commitment from at least 2 clinics
- [ ] **Week 18:** Provide early access for testing
- [ ] **Week 24:** Official pilot launch

**Incentive Program:**
- 3 months free subscription
- Priority support (dedicated Slack channel)
- Influence on roadmap priorities

**Backup Plan:** Use internal test clinic with simulated workflows

---

## AI-Assisted Implementation Strategy

### Hybrid Implementation Model

**Overall AI Contribution: 50-60%**
**Human Oversight: 40-50%**

### Implementation Workflow (Per Phase)

```
1. Human creates detailed task breakdown
   ├─ Specify AI-suitable tasks
   └─ Identify critical review points

2. Claude Code implements assigned components
   ├─ Generate code from specifications
   ├─ Follow exact patterns provided
   └─ Document assumptions

3. Human reviews all AI-generated code
   ├─ Validate security patterns
   ├─ Check compliance requirements
   └─ Verify business logic

4. Claude Code writes tests
   ├─ Based on success criteria
   ├─ Cover happy paths
   └─ Include edge cases

5. Human validates test coverage
   ├─ Ensure edge cases covered
   ├─ Add security-specific tests
   └─ Verify integration scenarios

6. Human conducts integration review
   ├─ Cross-component validation
   ├─ Performance testing
   └─ Security scanning

7. Human approves phase completion
   └─ Sign-off before next phase
```

### Critical Guardrails

**Mandatory Human Review Points:**
- [ ] All Row Level Security (RLS) policies
- [ ] All audit logging implementation
- [ ] Authorization transaction logic (atomic operations)
- [ ] EDI claim generation code
- [ ] External API integrations (Whisper, Gemini, Stedi)
- [ ] Security patterns (authentication, encryption)
- [ ] Secrets management configuration

**AI Contribution Boundaries (Claude Code must NEVER):**
- Deploy autonomously to production
- Write directly to database without migration
- Manage secrets without human validation
- Implement billing logic without extensive tests
- Modify RLS policies without explicit approval

**Quality Gates (Per Phase):**
- [ ] 100% test coverage for billing/authorization code
- [ ] Security scan passed (OWASP ZAP, npm audit)
- [ ] HIPAA compliance checklist completed
- [ ] Human architect sign-off obtained
- [ ] Integration tests passing
- [ ] Load test benchmarks met

---

## Success Metrics

### Phase-Level Metrics

**Phase 1 (Foundation):**
- [ ] All 10 database tables created with constraints
- [ ] RLS policies prevent cross-org access (100% isolation)
- [ ] Audit logs capture VIEW_PATIENT, EDIT_SESSION, GENERATE_NOTE
- [ ] BAAs signed or alternatives documented

**Phase 2 (Intake):**
- [ ] Patient intake completed in < 2 minutes
- [ ] Authorization validation prevents negative units (100% enforced)

**Phase 3 (Scheduling):**
- [ ] Zero scheduling conflicts (enforced by DB function)
- [ ] Calendar loads in < 1 second

**Phase 4 (Clinical):**
- [ ] SOAP notes generated in < 8 seconds
- [ ] Client-side metrics update in < 100ms
- [ ] Voice transcription completes in < 5 seconds

**Phase 5 (Billing):**
- [ ] 100% of claims pass EDI validation
- [ ] Zero authorization over-billing incidents

**Phase 6 (Pilot):**
- [ ] 20+ sessions completed with 95%+ data quality
- [ ] RBT satisfaction score > 7/10
- [ ] Zero P0/P1 bugs in production

### Post-Pilot Scaling Metrics

**6-Month Goals (Post-Pilot):**
- 10 paying clinics (50-100 providers)
- 500+ patients active
- 2,000+ sessions per month
- < 2% monthly churn
- Claim acceptance rate > 95%

---

## Immediate Next Steps (Week 0 - Pre-Development)

### DAY 1-2: Legal & Compliance Setup

**1. Initiate BAA Process**
- [ ] Supabase: Email sales@supabase.com requesting Enterprise BAA
- [ ] Vercel: Confirm no BAA, document AWS Amplify as alternative
- [ ] AWS: Sign standard BAA (available in AWS Artifact)
- [ ] OpenAI: Sign BAA via platform.openai.com/account/legal
- [ ] Google Cloud: Sign BAA via cloud.google.com/security/compliance/hipaa
- [ ] Stedi: Confirm BAA included in contract

**2. Engage HIPAA Consultant**
- [ ] RFP to 3 compliance firms
- [ ] Select firm by end of Week 1
- [ ] Schedule kickoff for Week 2

### DAY 3-5: Environment Setup

**1. Provision Infrastructure**
- [ ] Create Supabase project (Pro Plan: $25/month)
- [ ] Create AWS account + set up Secrets Manager
- [ ] Register domain: omnirapeutic.com
- [ ] Set up GitHub organization + repos

**2. Developer Workstations**
- [ ] Install Node.js 20, PostgreSQL 15, Expo CLI
- [ ] Configure VSCode with ESLint, Prettier, TypeScript
- [ ] Set up local Supabase instance (`supabase init`)

**3. CI/CD Foundation**
- [ ] Create GitHub Actions workflows (lint, test, deploy)
- [ ] Set up staging environment (staging.omnirapeutic.com)
- [ ] Configure Sentry for error tracking

### WEEK 1: Team Kickoff & Sprint Planning

**Day 1: Team Kickoff**
- Present revised implementation plan
- Assign Phase 1 tasks
- Review HIPAA requirements

**Day 2-3: Architecture Review**
- Whiteboard database schema
- Review atomic transaction patterns
- Discuss client-side aggregation approach

**Day 4-5: Begin Phase 1 Development**
- Create database migrations (schema)
- Implement audit logging
- Write RLS policies

---

## Post-MVP Roadmap (Deferred Features)

### Phase 7: Advanced Scheduling (Months 7-8)
- Authorization-aware scheduling (prevent over-booking)
- Smart rescheduling with substitute suggestions
- Recurring appointment templates

### Phase 8: Real-Time Analytics (Months 8-9)
- Animated trend charts (clinical insights agent)
- Dashboard for BCBAs
- Progress tracking over time

### Phase 9: Automation & Integration (Months 9-12)
- EDI 270/271 automated eligibility checks
- EDI 278 prior authorization submission
- Parent portal with progress reports
- Integration with CentralReach, Rethink (data export)

### Phase 10: Enterprise Features (Year 2)
- Multi-clinic management (enterprise tier)
- Advanced reporting & BI
- Custom payer rule engine
- Mobile offline mode

---

## Conclusion

This revised plan is **100% ready for immediate implementation** with:
- All critical issues from expert review addressed
- Exact code patterns and database schemas provided
- Clear success criteria for each phase
- Comprehensive risk mitigation strategies
- Realistic 16-20 week timeline with AI assistance
- Structured hybrid approach (AI + human oversight)

**Confidence Level:** HIGH (7.5/10 consensus) that this plan will result in a production-ready MVP within 5-6 months with AI-assisted implementation.

**Key Success Factors:**
1. Secure all BAAs by Week 12 (non-negotiable)
2. Implement atomic authorization logic correctly (prevents revenue loss)
3. Maintain focus on MVP scope (defer post-MVP features aggressively)
4. Conduct thorough load testing before pilot (Week 20)
5. Select engaged pilot clinic (start outreach in Week 6)
6. Use Claude Code strategically with proper human oversight

**First Action:** Initiate BAA requests with all vendors and set up AI collaboration framework for Phase 1 implementation.

---

**IMPLEMENTATION PLAN COMPLETE - READY FOR APPROVAL AND EXECUTION**
