# Omnirapeutic Implementation Plan

**Version:** 1.0
**Status:** Ready for Review
**Last Updated:** 2025-11-22

## Executive Summary

This document outlines the phased implementation approach for building Omnirapeutic, an AI-native practice management platform for ABA therapy. The implementation is structured in 6 phases, starting with foundational infrastructure and progressively adding intelligent automation.

---

## Technical Stack Overview

### Frontend
- **MVP Prototype:** Single-file React application (index.html)
- **Production:** React Native with Expo
- **Styling:** Tailwind CSS

### Backend & Infrastructure
- **Database:** Supabase (PostgreSQL)
- **Realtime Engine:** Supabase Realtime (WebSockets)
- **Authentication:** Supabase Auth with Row Level Security (RLS)
- **Storage:** Supabase Storage
- **Hosting:** Vercel Pro Plan

### AI & Integrations
- **Text Generation:** Google Gemini 1.5 Flash or Azure OpenAI GPT-4o
- **Speech-to-Text:** OpenAI Whisper
- **EDI Clearinghouse:** Stedi (for eligibility checks and claims)
- **Browser Automation:** Playwright + Gemini Vision

---

## Phase 1: Foundation & Compliance

**Objective:** Establish secure data model and legal framework for HIPAA compliance.

### Deliverables

#### 1.1 Database Schema (Supabase)

**Core Tables:**
- `client_sessions` - Header record tracking session state
- `session_events` - Append-only log of clinical interactions
- `client_authorizations` - Insurance approval limits and unit tracking
- `appointments` - Scheduling with service codes and recurrence rules
- `payer_rules` - State/payer-specific requirements
- `prior_auth_requests` - Authorization request tracking
- `prior_auth_documents` - Supporting documentation

**Key Features:**
- UUID primary keys
- JSONB fields for flexible data (metrics, AI notes)
- Foreign key relationships
- Status enums with constraints
- Timestamp tracking (created_at, updated_at)

#### 1.2 Security & Compliance

- **Row Level Security (RLS):** Enable on all tables for tenant isolation
- **Business Associate Agreements (BAA):**
  - Vercel Pro
  - Supabase
  - Azure/OpenAI or Google Cloud
- **Data Isolation:** Multi-tenant architecture with organization_id/tenant_id

#### 1.3 Success Criteria
- [ ] All tables created with proper constraints
- [ ] RLS policies implemented and tested
- [ ] BAAs signed with all vendors
- [ ] Basic CRUD operations working

---

## Phase 2: Core Agents (Data & Documentation)

**Objective:** Automate clinical data collection and session note generation.

### 2.1 Data Steward Agent (DSA)

**Role:** The "Invisible Observer" - aggregates raw events into meaningful metrics.

**Implementation:**
- PostgreSQL trigger: `aggregate_session_metrics`
- Fires on INSERT to `session_events`
- Calculates aggregates in real-time:
  - Tantrum count
  - Duration totals
  - Manding success rate (correct/total)
  - Other target behaviors

**Logic Flow:**
```
RBT logs event → INSERT session_events
→ Trigger fires → Calculate aggregates
→ UPDATE client_sessions.latest_metrics
→ Supabase Realtime broadcasts → Dashboard updates instantly
```

**Code Structure:**
```sql
CREATE FUNCTION aggregate_metrics() RETURNS trigger AS $$
BEGIN
  UPDATE client_sessions
  SET latest_metrics = (
    SELECT jsonb_build_object(
      'tantrum_count', COUNT(*) FILTER (WHERE event_type = 'TANT_START'),
      'duration_total', SUM(raw_value) FILTER (WHERE event_type = 'DURATION_ADD'),
      'manding_correct', COUNT(*) FILTER (WHERE event_type = 'MAND_C'),
      'manding_total', COUNT(*) FILTER (WHERE event_type IN ('MAND_C', 'MAND_I'))
    )
    FROM session_events
    WHERE session_id = NEW.session_id
  )
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2.2 Documentation Agent (DA)

**Role:** The "Scribe" - converts metrics and voice notes into clinical SOAP notes.

**Implementation:**
- LLM API integration (Gemini 1.5 Flash or GPT-4o)
- Whisper API for voice transcription
- State-aware prompt templates

**Workflow:**
1. RBT records voice note: "Client was tired but engaged well"
2. Whisper API converts audio → text
3. System gathers context:
   - Client name, state, diagnosis
   - Session metrics from DSA
   - Session duration
4. Construct prompt with state-specific rules:
   - TX: Must include "Caregiver Participation" in Plan
   - Other state-specific requirements from `payer_rules`
5. LLM generates SOAP note
6. Save to `client_sessions.ai_note_json`

**Prompt Template:**
```
You are an expert BCBA. Write a clinical SOAP note based on the data below.

State Rule: {state_specific_rules}

CLIENT CONTEXT:
- Name: {client.name}
- State: {client.state}
- Session Duration: {duration} minutes

SUBJECTIVE:
{narrative_from_voice_note}

OBJECTIVE DATA:
{latest_metrics}

Write a SOAP note with:
- Subjective: Summarize narrative
- Objective: Report raw data
- Assessment: Analyze trends
- Plan: Recommend continuing protocol
```

#### 2.3 Success Criteria
- [ ] DSA trigger updates metrics < 100ms
- [ ] Dashboard updates instantly via Realtime
- [ ] SOAP note generated < 5 seconds after session end
- [ ] Notes are state-compliant (TX caregiver requirement, etc.)

---

## Phase 3: Clinical Insight Agent (CIA)

**Objective:** Provide visual decision support during sessions.

### 3.1 Real-Time Visual Trends

**Implementation:**
- SVG-based line charts (client-side rendering)
- Maintains history array: `[previous_1, previous_2, ..., current_live]`
- Updates on Supabase Realtime events

**Logic:**
```javascript
// Subscribe to session updates
const subscription = supabase
  .from('client_sessions')
  .on('UPDATE', (payload) => {
    const newMetrics = payload.new.latest_metrics;
    const accuracy = calculateAccuracy(newMetrics);

    // Update history
    metricsHistory.push(accuracy);
    if (metricsHistory.length > 20) metricsHistory.shift();

    // Re-render chart
    renderTrendChart(metricsHistory);
  })
  .subscribe();
```

**Features:**
- Live updating line graphs
- Multiple metrics tracked simultaneously:
  - Manding accuracy
  - Behavior frequency
  - Task completion rates
- Color-coded zones (mastery, emerging, needs support)

### 3.2 Success Criteria
- [ ] Charts update in < 200ms after data change
- [ ] Smooth animations between data points
- [ ] Mobile-responsive (works on tablets)
- [ ] RBTs can see trend direction mid-session

---

## Phase 4: Monetization (Practice Manager Agent)

**Objective:** Ensure every session is billable and generate claims automatically.

### 4.1 Authorization Gatekeeper

**Trigger:** User clicks "Start Session"

**Pre-Flight Check Logic:**
```javascript
async function checkAuthorization(clientId, serviceCode) {
  const auth = await supabase
    .from('client_authorizations')
    .select('*')
    .eq('client_id', clientId)
    .eq('service_code', serviceCode)
    .single();

  const now = new Date();
  const isExpired = now > new Date(auth.end_date);
  const remainingUnits = auth.total_units - auth.used_units;
  const isExhausted = remainingUnits <= 0;

  if (isExpired) {
    return { allow: false, error: 'Authorization expired', code: 'AUTH_EXPIRED' };
  }

  if (isExhausted) {
    return { allow: false, error: 'No units remaining', code: 'AUTH_EXHAUSTED' };
  }

  return { allow: true, remainingUnits };
}
```

**UI Behavior:**
- **Pass:** Session starts normally
- **Fail:** Show modal with specific error and recommended action
  - "Authorization expired on MM/DD/YYYY. Submit continuation request?"
  - "Only 2 units remaining. This session requires 4 units."

### 4.2 Unit Tracking

**Post-Session Logic:**
```javascript
async function endSession(sessionId) {
  const session = await getSession(sessionId);
  const durationMinutes = calculateDuration(session.start_time, session.end_time);

  // Apply 8-minute rule and 15-minute rounding
  let units = 0;
  if (durationMinutes >= 8) {
    units = Math.ceil(durationMinutes / 15);
  }

  // Decrement authorization
  await supabase.rpc('decrement_authorization', {
    client_id: session.client_id,
    service_code: session.service_code,
    units_used: units
  });

  return units;
}
```

### 4.3 EDI Claim Generator

**Trigger:** Session marked as COMPLETE

**Output Format:** JSON structure matching EDI 837P standard

```javascript
function generateClaim(session, authorization, provider) {
  return {
    header: {
      type: '837P',
      sender: 'OMNIRAPEUTIC',
      receiver: authorization.payer_id,
      submission_date: new Date().toISOString()
    },
    provider: {
      npi: provider.npi,
      tax_id: provider.tax_id,
      name: provider.name
    },
    subscriber: {
      member_id: authorization.member_id,
      group_number: authorization.group_number
    },
    claim: {
      diagnosis_code_1: session.primary_diagnosis,
      service_lines: [{
        date: session.start_time.split('T')[0],
        procedure_code: session.service_code,
        units: session.billed_units,
        charge: session.billed_units * authorization.rate,
        place_of_service: '12' // Home
      }]
    }
  };
}
```

**Integration:**
- Submit to Stedi clearinghouse via API
- Track submission status in `claims` table
- Handle rejections and resubmissions

### 4.4 Success Criteria
- [ ] Impossible to start session without valid auth
- [ ] Unit calculation follows 8-minute and 15-minute rules
- [ ] Claims generated within 1 second of session completion
- [ ] EDI format validated before submission

---

## Phase 5: Intake & Engagement

**Objective:** Automate patient acquisition and authorization management.

### 5.1 Eligibility Verification

**Implementation:** Stedi EDI 270/271 integration

**Workflow:**
1. User uploads insurance card photo
2. OCR extracts: Member ID, Payer Name, DOB
3. System sends EDI 270 request via Stedi
4. Parse 271 response:
   - Active coverage status
   - Benefit details (copay, deductible)
   - Plan name

**Logic:**
```javascript
async function checkEligibility(memberId, payerId, dob, providerNpi) {
  const response = await stedi.post('/x12/270', {
    member_id: memberId,
    payer_id: payerId,
    date_of_birth: dob,
    provider_npi: providerNpi,
    service_type_code: 'MH' // Mental Health (ABA)
  });

  // Parse EB segments
  const coverage = response.eligibility_segments.find(seg =>
    seg.service_type === 'MH' && seg.coverage_level === '1' // Active
  );

  if (coverage) {
    return {
      active: true,
      payer_name: response.payer_name,
      plan_name: response.plan_name,
      copay: coverage.copay_amount,
      deductible_remaining: coverage.deductible_remaining
    };
  }

  return { active: false };
}
```

### 5.2 Prior Authorization Automation

**Decision Engine:**
- Check `payer_rules` table for submission method
- Route based on payer:
  - **United/Aetna:** Browser automation (Playwright)
  - **EDI-enabled payers:** Submit EDI 278
  - **Others:** Manual submission workflow

**Browser Automation Flow:**
1. System detects payer supports portal automation
2. Playwright script launches headless browser
3. Gemini Vision guides navigation:
   - Login to payer portal
   - Navigate to auth request form
   - Fill fields from `prior_auth_requests` data
   - Upload documents from `prior_auth_documents`
   - Submit and capture confirmation
4. Update status to 'SUBMITTED' with confirmation number

**Manual Fallback:**
- Generate PDF packet (treatment plan + assessment)
- Create ZIP file for download
- Set status to 'NEEDS_MANUAL_SUBMISSION'
- Send notification to admin

### 5.3 Parent Portal

**Features:**
- View upcoming sessions
- See progress charts
- Receive session summaries
- Update insurance information

**Security:**
- Magic link authentication (email-based)
- RLS policy: `auth.uid() IN (SELECT parent_id FROM patient_relations WHERE patient_id = current_patient)`

### 5.4 Success Criteria
- [ ] Patient photo ID → Active profile < 2 minutes
- [ ] Eligibility check completes < 5 seconds
- [ ] Auth packets adapt to state/payer rules automatically
- [ ] Browser automation works for top 3 payers
- [ ] Parents can view data within 24 hours of onboarding

---

## Phase 6: Intelligent Scheduling

**Objective:** Optimize utilization while preventing non-billable sessions.

### 6.1 Scheduling Constraints

**Conflict Prevention:**
```sql
CREATE FUNCTION check_scheduling_conflict(
  p_provider_id uuid,
  p_client_id uuid,
  p_start timestamptz,
  p_end timestamptz
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM appointments
    WHERE status = 'SCHEDULED'
    AND (provider_id = p_provider_id OR client_id = p_client_id)
    AND tsrange(start_time, end_time) && tsrange(p_start, p_end)
  );
END;
$$ LANGUAGE plpgsql;
```

**Authorization Burn Rate Check:**
```javascript
async function validateScheduling(clientId, serviceCode, startTime, endTime, isRecurring, occurrences) {
  const auth = await getAuthorization(clientId, serviceCode);

  // Calculate proposed cost
  const durationMinutes = (endTime - startTime) / (1000 * 60);
  const unitsPerSession = Math.ceil(durationMinutes / 15);
  const totalProposedUnits = unitsPerSession * (isRecurring ? occurrences : 1);

  // Check current usage
  const used = auth.used_units;
  const scheduled = await getScheduledUnits(clientId, serviceCode);
  const available = auth.total_units - used - scheduled;

  if (totalProposedUnits > available) {
    return {
      allowed: false,
      error: `Cannot schedule: Client has ${available} units available, but this ${isRecurring ? 'series' : 'session'} requires ${totalProposedUnits} units.`
    };
  }

  return { allowed: true };
}
```

### 6.2 Calendar Features

**Views:**
- Day view (15-min increments)
- Week view (provider columns)
- Month view (condensed)
- Resource view (filter by provider)

**Color Coding:**
- Blue: Scheduled/Billable
- Green: Completed/Verified
- Red: Cancelled/No-Show
- Orange: Needs documentation
- Grey: Non-billable (admin time)

**Smart Rescheduling:**
When RBT unavailable, suggest substitutes based on:
1. Calendar availability
2. Active credentialing with payer
3. Previous work with client (familiarity)
4. Geographic proximity

### 6.3 Recurring Appointments

**Implementation:**
- Store recurrence rules in RRule format
- Generate instances on-demand (not pre-populate)
- Update logic: "This appointment only" vs "This and future"

**Authorization Integration:**
- Validate entire series against remaining units
- Reserve units via `scheduled_units` column
- Release units if appointment cancelled

### 6.4 Success Criteria
- [ ] Impossible to double-book provider or client
- [ ] Impossible to schedule beyond authorization limits
- [ ] Recurring series validated as a unit
- [ ] Calendar loads < 1 second for week view
- [ ] Substitute suggestions return < 2 seconds

---

## Implementation Timeline

### Sprint Structure
Each phase represents approximately 2-3 sprints (4-6 weeks of development).

### Milestones

**M1: Foundation Complete** (End of Phase 1)
- All tables created
- Security implemented
- Basic UI scaffold

**M2: Core Workflow** (End of Phase 2)
- RBTs can log sessions
- Notes auto-generate
- Dashboard shows live data

**M3: Clinical Decision Support** (End of Phase 3)
- Charts render in real-time
- Trends visible during sessions

**M4: Billing Automation** (End of Phase 4)
- Authorization checks enforced
- Claims auto-generate
- Ready for first billed session

**M5: End-to-End Automation** (End of Phase 5)
- Patient onboarding automated
- Eligibility checks live
- Parent portal active

**M6: Full Platform** (End of Phase 6)
- Scheduling with auth awareness
- Complete practice management suite

---

## Risk Mitigation

### Technical Risks

**Risk:** Supabase Realtime latency in production
- **Mitigation:** Load test with 100+ concurrent sessions; implement fallback polling

**Risk:** LLM API rate limits or downtime
- **Mitigation:** Implement queue system; fallback to simpler template-based notes

**Risk:** Browser automation breaks when payer portals change
- **Mitigation:** Gemini Vision provides resilience; maintain manual fallback; monitor success rates

### Compliance Risks

**Risk:** BAA delays with vendors
- **Mitigation:** Begin legal process in Phase 0 (pre-development)

**Risk:** State-specific documentation requirements missed
- **Mitigation:** Partner with practicing BCBAs in each target state for review

### Business Risks

**Risk:** Adoption resistance from RBTs
- **Mitigation:** Mobile-first UX; extensive field testing; simple 3-click workflow

**Risk:** Payer rejection of automated claims
- **Mitigation:** EDI format validation; pilot with single payer; scrubbing logic

---

## Success Metrics

### Phase 1-2 (Core Workflow)
- Session start to note completion: < 2 minutes
- Data accuracy: 99%+ (vs manual entry)
- RBT satisfaction: 8+/10

### Phase 3 (Insights)
- Chart render time: < 200ms
- Clinical decision changes: 30%+ of sessions

### Phase 4 (Billing)
- Authorization check accuracy: 100%
- Claim generation success rate: 99%+
- Claim acceptance rate: 95%+

### Phase 5 (Intake)
- Intake time: < 5 minutes (vs 30+ minutes manual)
- Eligibility check success rate: 98%+
- Parent portal engagement: 60%+ weekly active

### Phase 6 (Scheduling)
- Scheduling conflicts: 0 (enforced by constraints)
- Over-authorization bookings: 0 (enforced)
- Staff utilization: 85%+ billable time

---

## Next Steps

1. **Review & Approval:** Stakeholder sign-off on this plan
2. **Environment Setup:** Provision Supabase, Vercel, Stedi accounts
3. **Legal:** Initiate BAA process with all vendors
4. **Team Assembly:** Assign developers to Phase 1 tasks
5. **Sprint 1 Kickoff:** Begin database schema implementation

---

## Appendix: Development Standards

### Code Organization
- Monorepo structure (if multi-platform)
- Feature-based directory structure
- Shared utilities in `/lib`

### Testing Strategy
- Unit tests: Core business logic (auth checks, unit calculations)
- Integration tests: Database triggers, API integrations
- E2E tests: Critical paths (session flow, claim generation)
- Load tests: Realtime performance with 100+ concurrent users

### Documentation
- API documentation (OpenAPI/Swagger)
- Database schema diagrams (ERD)
- Architecture decision records (ADRs)
- User guides (RBT, BCBA, Admin)

### Deployment
- CI/CD via GitHub Actions
- Staging environment mirrors production
- Blue-green deployment for zero-downtime
- Database migrations via Supabase CLI

---

**Document End**
