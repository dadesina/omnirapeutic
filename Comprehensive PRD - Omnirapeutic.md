# **Comprehensive Product Requirements Document (PRD): Omnirapeutic**

Product Name: Omnirapeutic  
Version: 1.9 (MVP Phases 1-6 \+ Detailed Eligibility Logic)  
Status: Ready for Implementation  
Target Audience: BCBAs, RBTs, Clinic Admins, and Parents.  
Core Value: AI-Native Practice Management Platform that automates the entire lifecycle: Intake, Clinical, Documentation, Billing, and Scheduling.

## **1\. Executive Summary**

Omnirapeutic is an "AI-Native" SaaS platform designed to eliminate the administrative burden in Applied Behavior Analysis (ABA). Unlike legacy platforms, Omnirapeutic employs a **Multi-Agent System** to actively perform tasks: onboarding patients, obtaining authorizations, collecting real-time data, drafting notes, scrubbing claims, and optimizing schedules.

## **2\. Technical Architecture & Stack**

* **Architecture:** Single-File React Application (MVP) $\\to$ React Native (Expo).  
* **Hosting:** Vercel (Pro Plan) \+ Supabase (PostgreSQL/Realtime/Auth).  
* **AI:** Google Gemini 1.5 Flash / OpenAI Whisper.  
* **Integrations:** Stedi (EDI Clearinghouse) for Eligibility/Claims.  
* **Browser Automation:** Playwright \+ Gemini Vision for RPA.  
* **Scheduling:** Custom React Big Calendar \+ Supabase implementation (Authorization-Aware).

## **3\. Phase 1: Foundation & Compliance**

**Objective:** Establish the secure data model and legal framework.

### **3.1 Data Models (Supabase Schema Definitions)**

**A. client\_sessions (The Header Record)**

TABLE client\_sessions (  
  id uuid PRIMARY KEY,  
  client\_id uuid REFERENCES patients(id),  
  provider\_id uuid REFERENCES providers(id),  
  appointment\_id uuid REFERENCES appointments(id), \-- Link to schedule  
  start\_time timestamptz DEFAULT now(),  
  end\_time timestamptz,  
  status text,  
  latest\_metrics jsonb,  
  ai\_note\_json jsonb  
);

**B. client\_authorizations (Billing Guardrails)**

TABLE client\_authorizations (  
  id uuid PRIMARY KEY,  
  client\_id uuid REFERENCES patients(id),  
  service\_code text NOT NULL,   
  total\_units numeric NOT NULL,  
  used\_units numeric DEFAULT 0,  
  scheduled\_units numeric DEFAULT 0, \-- New: Tracks future commitments  
  start\_date date,  
  end\_date date,  
  status text  
);

**C. appointments (The Schedule)**

TABLE appointments (  
  id uuid PRIMARY KEY,  
  tenant\_id text,  
  client\_id uuid REFERENCES patients(id),  
  provider\_id uuid REFERENCES providers(id),  
  start\_time timestamptz NOT NULL,  
  end\_time timestamptz NOT NULL,  
  service\_code text NOT NULL, \-- Links to Auth  
  status text CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO\_SHOW')),  
  recurrence\_rule text \-- RRule format for recurring sessions  
);

**D. payer\_rules (State/Payer Specifics)**

TABLE payer\_rules (  
  id uuid PRIMARY KEY,  
  payer\_id text NOT NULL, \-- e.g., 'OPTUM', 'AETNA'  
  state\_code text NOT NULL, \-- e.g., 'TX', 'AZ', 'NY'  
  auth\_validity\_months integer DEFAULT 6, \-- 6 vs 12 months  
  required\_forms jsonb, \-- e.g., \["Assessment\_Form\_A", "Treatment\_Request\_Form"\]  
  submission\_method text CHECK (method IN ('PORTAL', 'FAX', 'EDI'))  
);

**E. prior\_auth\_requests (New: Detailed Tracking)**

TABLE prior\_auth\_requests (  
  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  organization\_id text NOT NULL,  
  client\_id uuid NOT NULL,  
  authorization\_id uuid, \-- Linked once approved

  \-- Request Details  
  request\_type text CHECK (request\_type IN ('INITIAL', 'CONTINUATION', 'MODIFICATION')),  
  service\_type text CHECK (service\_type IN ('ASSESSMENT', 'TREATMENT', 'BOTH')),  
  requested\_codes jsonb, \-- Array of CPT codes  
  requested\_units integer,  
  requested\_start\_date date,  
  requested\_end\_date date,

  \-- Payer Info  
  payer\_name text,  
  policy\_number text,  
    
  \-- Workflow Status  
  status text DEFAULT 'NECESSITY\_CHECK' CHECK (status IN ('NECESSITY\_CHECK', 'PACKET\_ASSEMBLY', 'READY\_FOR\_SUBMISSION', 'SUBMITTED', 'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED')),  
  submission\_method text, \-- 'EDI\_278', 'PORTAL\_AUTOMATION', 'MANUAL'  
  submitted\_at timestamptz,  
    
  \-- Clinical Info  
  diagnosis\_code text,  
  clinical\_justification text,  
  treatment\_plan\_id uuid,

  created\_at timestamptz DEFAULT now(),  
  updated\_at timestamptz  
);

**F. prior\_auth\_documents (New: Evidence)**

TABLE prior\_auth\_documents (  
  id uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  prior\_auth\_id uuid REFERENCES prior\_auth\_requests(id),  
  document\_type text, \-- 'TREATMENT\_PLAN', 'MEDICAL\_NECESSITY\_LETTER', 'DIAGNOSTIC\_REPORT'  
  file\_name text,  
  file\_url text, \-- Supabase Storage URL  
  auto\_generated boolean DEFAULT false,  
  generation\_source text \-- 'DOCUMENTATION\_AGENT', 'MANUAL'  
);

## **4\. Phase 2: Core Agents (Data & Documentation)**

**Objective:** Automate the clinical session.

### **4.1 The Data Steward Agent (DSA) Logic**

Mechanism: PostgreSQL Database Trigger.  
Trigger Logic (PL/pgSQL):  
\-- LOGIC: Run after every INSERT on session\_events  
FUNCTION aggregate\_metrics() {  
  SELECT   
    COUNT(\*) FILTER (WHERE event\_type \= 'TANT\_START') as tantrum\_count,  
    SUM(raw\_value) FILTER (WHERE event\_type \= 'DURATION\_ADD') as duration\_total,  
    COUNT(\*) FILTER (WHERE event\_type \= 'MAND\_C') as manding\_success,  
    COUNT(\*) FILTER (WHERE event\_type IN ('MAND\_C', 'MAND\_I')) as manding\_total  
  INTO new\_metrics  
  FROM session\_events WHERE session\_id \= NEW.session\_id;  
    
  UPDATE client\_sessions SET latest\_metrics \= new\_metrics WHERE id \= NEW.session\_id;  
}

### **4.2 The Documentation Agent (DA) Logic**

Mechanism: LLM Prompt Engineering.  
Input Construction:  
Context \= "Client: " \+ client.name \+ " | State: " \+ client.state  
Data \= JSON.stringify(session.latest\_metrics)  
**System Prompt Template (State-Aware):**

"You are an expert BCBA. Write a clinical SOAP note based on the data.  
State Rule: If State is 'TX', ensure 'Caregiver Participation' is explicitly noted in the Plan section.  
Subjective: Summarize narrative: {Narrative}.  
Objective: Report raw data: {Data}.  
Assessment: Analyze trend.  
Plan: Recommend continuing protocol."

## **5\. Phase 3: Clinical Insight Agent (CIA)**

**Objective:** Visual decision support.

### **5.1 Visual Data Trends Logic**

Mechanism: Client-Side Calculation.  
Logic:

1. **History State:** Maintain array \[previous\_1, previous\_2, ... current\_live\].  
2. **Update Cycle:** On SUPABASE\_UPDATE event $\\to$ Re-calculate current accuracy $\\to$ Replace last array element $\\to$ Re-render SVG path.

## **6\. Phase 4: Monetization (Practice Manager Agent)**

**Objective:** Ensure billability and generate claims.

### **6.1 Authorization Gatekeeper Logic**

Trigger: User clicks "Start Session".  
Gatekeeper Function:  
function checkAuth(authRecord) {  
  const now \= new Date();  
  const isExpired \= now \> new Date(authRecord.end\_date);  
  const isExhausted \= (authRecord.total\_units \- authRecord.used\_units) \<= 0;  
    
  if (isExpired) return { allow: false, error: "Auth Expired" };  
  if (isExhausted) return { allow: false, error: "Zero Units Remaining" };  
  return { allow: true };  
}

### **6.2 EDI Claim Generator Logic**

Trigger: Session Status $\\to$ COMPLETE.  
Unit Calculation Rule:  
Units \= Math.ceil(Minutes / 15\) (Standard 15-min billing rule).  
Constraint: If Minutes \< 8, Units \= 0 (8-minute rule).  
**JSON Schema Output (Mock EDI 837P):**

{  
  "header": { "type": "837P", "sender": "OMNIRAPEUTIC", "receiver": "PAYER\_ID" },  
  "provider": { "npi": "PROVIDER\_NPI", "tax\_id": "CLINIC\_TAX\_ID" },  
  "subscriber": { "member\_id": "PATIENT\_MEMBER\_ID", "group": "GROUP\_NUM" },  
  "claim": {  
    "diagnosis\_code\_1": "F84.0",  
    "service\_lines": \[  
      {  
        "date": "YYYY-MM-DD",  
        "procedure\_code": "97153",  
        "units": 4, // Calculated  
        "charge": 60.00 // units \* rate  
      }  
    \]  
  }  
}

## **7\. Phase 5: Intake & Engagement (Logic Details)**

**Objective:** Automate patient acquisition.

### **7.1 Eligibility Check Logic**

Input: member\_id, payer\_id, provider\_npi, date\_of\_birth.  
Stedi API Call: POST /x12/270 (Eligibility Inquiry).  
Response Parsing Logic:

1. Parse JSON response from Stedi (EDI 271).  
2. Look for EB (Eligibility Benefit) segments where Service Type Code matches ABA codes (AL or MH).  
3. Active Logic: \* IF EB01 (Eligibility or Benefit Information) \=== '1' (Active Coverage):  
   \* Update patients.status \= 'ACTIVE'.  
   \* Extract Payer Name and Plan Name.  
   * ELSE: Flag as INACTIVE or ERROR.  
4. **Financial Logic:** \* Extract EB segment where Time Period Qualifier is 26 (Per Visit) or 29 (Copay).  
   * Store Copay Amount and Deductible Remaining in the patient\_insurance table.

### **7.2 Prior Authorization Logic (Hybrid)**

**Decision Engine:**

* IF Payer \== 'United' OR 'Aetna': Use **Browser Automation Agent** (Playwright script for specific portal).  
* IF Payer \== 'Small\_Local\_Plan': Use **Human-in-Loop**.  
  * **Action:** Generate ZIP file (PDF Treatment Plan \+ PDF Assessment).  
  * **Status:** Set auth\_requests.status \= 'NEEDS\_MANUAL\_SUBMISSION'.

### **7.3 Parent Portal Logic**

* **Security:** Parents authenticate via Magic Link (Email).  
* **Data Scoping:** RLS Policy auth.uid() IN (SELECT parent\_id FROM patient\_relations WHERE patient\_id \= current\_patient).

## **8\. Phase 6: Intelligent Scheduling (New)**

**Objective:** Optimize staff utilization while preventing non-billable sessions.

### **8.1 The Scheduler Agent**

* **Role:** The "Traffic Controller."  
* **Implementation:** Custom Logic \+ Database Constraints (Not Cal.com).

### **8.2 Scheduling Logic & Guardrails**

**Trigger:** Admin attempts to book a session (or recurring series).

**Logic 1: The Conflict Check**

\-- Prevent double-booking providers or clients  
FUNCTION check\_conflict(p\_id, c\_id, start, end) {  
  IF EXISTS (  
    SELECT 1 FROM appointments   
    WHERE (provider\_id \= p\_id OR client\_id \= c\_id)  
    AND status \= 'SCHEDULED'  
    AND tsrange(start\_time, end\_time) && tsrange(start, end)  
  ) RETURN "CONFLICT";  
}

**Logic 2: The Authorization Burn Rate Check**

* **Input:** Client ID, Service Code (97153), Proposed Duration.  
* **Calculation:**  
  1. Current\_Used \= Units used in past sessions.  
  2. Future\_Scheduled \= Sum of units in *future* SCHEDULED appointments.  
  3. Proposed\_Cost \= Duration / 15 mins.  
  4. Limit \= Total\_Authorized\_Units.  
* **Constraint:** IF (Current\_Used \+ Future\_Scheduled \+ Proposed\_Cost) \> Limit $\\to$ **BLOCK BOOKING**.  
* **Error Message:** *"Cannot schedule: Client only has 12 units remaining, but this series requires 40."*

### **8.3 Calendar UI Features**

* **Views:** Day, Week, Month, Resource (Provider columns).  
* **Color Coding:**  
  * Blue: Billable/Scheduled.  
  * Green: Completed/Verified.  
  * Red: Cancelled/No-Show.  
  * Grey: Non-Billable (Admin time).  
* **Smart Rescheduling:** If an RBT calls out sick, the Agent suggests the "Best Fit" substitute RBT based on:  
  1. Availability.  
  2. Credentialing (Active with this Payer).  
  3. Familiarity (Has worked with this client before).

## **9\. Success Criteria (Full MVP)**

1. **Intake:** Patient photo ID $\\to$ Active Profile in \< 2 minutes.  
2. **Auth:** System adapts packet to State/Payer rules and manages submission lifecycle.  
3. **Scheduling:** Impossible to book a session that exceeds authorization limits.  
4. **Clinical:** RBT captures data/audio $\\to$ Signed Note in \< 5 seconds.  
5. **Billing:** Session End $\\to$ JSON Claim File ready for submission.