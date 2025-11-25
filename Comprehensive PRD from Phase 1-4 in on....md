# **Comprehensive Product Requirements Document (PRD): Omnirapeutic**

Product Name: Omnirapeutic  
Version: 1.0 (MVP Phases 1-4)  
Status: Ready for Implementation  
Target Audience: Board Certified Behavior Analysts (BCBAs) and Registered Behavior Technicians (RBTs).  
Core Value: AI-Native Practice Management Platform that automates data collection, documentation, and billing for ABA therapy.

## **1\. Executive Summary**

Omnirapeutic is an "AI-Native" SaaS platform designed to eliminate the administrative burden in Applied Behavior Analysis (ABA). Unlike legacy platforms that function as passive databases, Omnirapeutic employs a **Multi-Agent System** to actively perform tasks: collecting real-time data, drafting compliant SOAP notes, analyzing clinical trends, and generating billing claims.

The MVP focuses on a mobile-first experience for RBTs in the field, ensuring seamless data capture and immediate monetization for clinic owners.

## **2\. Technical Architecture & Stack**

To ensure HIPAA compliance, speed to market, and low cost, the MVP utilizes a specific "Golden Path" stack.

### **2.1 Infrastructure**

* **Architecture:** Single-File React Application (MVP prototype via index.html) transitioning to React Native (Expo) for Production.  
* **Hosting/CDN:** Vercel (Pro Plan) for static assets and edge caching.  
* **Styling:** Tailwind CSS (via CDN for MVP).

### **2.2 Backend & Data**

* **Database:** Supabase (PostgreSQL).  
* **Realtime Engine:** Supabase Realtime (WebSockets) for instant dashboard updates.  
* **Authentication:** Supabase Auth (handling RLS and secure user sessions).  
* **Storage:** Supabase Storage (for audio files/logs).

### **2.3 AI Model Layer**

* **Text Generation (Documentation Agent):** Google Gemini 1.5 Flash (via API) or Azure OpenAI GPT-4o (Enterprise BAA).  
* **Speech-to-Text (Input):** OpenAI Whisper (via API).

## **3\. Phase 1: Foundation & Compliance**

**Objective:** Establish the secure data model and legal framework required for healthcare data.

### **3.1 Data Models (Supabase Schemas)**

The system relies on three core entities.

**A. client\_sessions (The Header Record)**

* Tracks the high-level session state.  
* **Key Fields:** id, tenant\_id, client\_id, provider\_id, start\_time, end\_time, status, subjective\_narrative, latest\_metrics (JSONB).

**B. session\_events (The Real-Time Log)**

* An append-only log of every interaction.  
* **Key Fields:** id, session\_id, event\_type (e.g., 'TANT\_START'), event\_time, raw\_value.

**C. client\_authorizations (Billing Guardrails)**

* Tracks insurance approval limits.  
* **Key Fields:** client\_id, service\_code (e.g., '97153'), total\_units, used\_units, start\_date, end\_date, status.

### **3.2 Compliance**

* **BAA:** Signed Business Associate Agreement with Vercel (Pro) and Azure/OpenAI.  
* **Data Isolation:** Row Level Security (RLS) enabled on all Supabase tables to enforce tenant isolation.

## **4\. Phase 2: Core Agents (Data & Documentation)**

**Objective:** Automate the collection of clinical data and the writing of session notes.

### **4.1 The Data Steward Agent (DSA)**

* **Role:** The "Invisible Observer." It aggregates raw clicks into meaningful clinical data in real-time.  
* **Implementation:** PostgreSQL Trigger (aggregate\_session\_metrics).  
* **Logic:**  
  1. RBT logs an event (INSERT INTO session\_events).  
  2. Trigger fires immediately.  
  3. Trigger calculates aggregates (Sum of Tantrums, Manding %, Duration).  
  4. Trigger updates client\_sessions.latest\_metrics.  
  5. **Outcome:** Dashboard updates instantly via Supabase Realtime.

### **4.2 The Documentation Agent (DA)**

* **Role:** The "Scribe." Converts raw metrics and subjective voice notes into clinical narratives.  
* **Implementation:** LLM API Call (Gemini/GPT).  
* **Workflow:**  
  1. RBT records voice note ("Client was tired but motivated").  
  2. Whisper API converts audio to text.  
  3. Agent combines subjective\_narrative \+ latest\_metrics \+ session\_duration.  
  4. Agent constructs a prompt: *"Act as a BCBA. Write a SOAP note..."*  
  5. **Outcome:** A drafted, compliant SOAP note is saved to ai\_note\_json for review.

## **5\. Phase 3: Clinical Insight Agent (CIA)**

**Objective:** Provide immediate visual feedback to the clinician to guide treatment decisions.

### **5.1 Visual Data Trends**

* **Feature:** In-session charting.  
* **Implementation:** SVG-based Line Chart component.  
* **Logic:**  
  * Maintains a local history array (mandingHistory).  
  * Updates the "Live" data point every time the DSA pushes a new metric.  
* **Outcome:** RBT sees a line graph of "Manding Accuracy" updating in real-time, allowing them to see if the client is learning or regressing during the session.

## **6\. Phase 4: Monetization (Practice Manager Agent)**

**Objective:** Ensure every session is billable and generate the necessary claims data.

### **6.1 Authorization Gatekeeper (Pre-Session)**

* **Logic:** Before startSession executes:  
  1. Query client\_authorizations for the specific client and service code.  
  2. Check: Is Active? AND Current Date \< End Date AND Remaining Units \> 0\.  
* **Outcome:**  
  * **Pass:** Session starts.  
  * **Fail:** Session is blocked with a specific error message (e.g., "Authorization Exhausted").

### **6.2 Unit Decrement (Post-Session)**

* **Logic:** Upon endSession:  
  1. Calculate Units Used (Duration / 15 mins).  
  2. Update client\_authorizations: used\_units \= used\_units \+ session\_units.

### **6.3 EDI Claim Generator**

* **Feature:** Automatic generation of billing files.  
* **Implementation:** generateEDIFile function.  
* **Logic:**  
  * Takes the final session data and authorization info.  
  * Formats it into a JSON structure mimicking the **EDI 837P** standard (Payer ID, NPI, Diagnosis Code, CPT Code, Units).  
* **UI Update:**  
  * Renders a "PMA Claim File" card in the UI with the generated JSON.  
  * Visual confirmation that the session is ready for submission to a clearinghouse (e.g., Stedi).

## **7\. Success Criteria (MVP)**

1. **Zero-Touch Data:** RBT taps buttons; database updates aggregates automatically (DSA).  
2. **Draft in Seconds:** SOAP note is generated \< 5 seconds after session end (DA).  
3. **Billing Safety:** Impossible to start a session without valid authorization (PMA).  
4. **Instant Claim:** A valid JSON/EDI object is produced immediately upon signature (PMA).