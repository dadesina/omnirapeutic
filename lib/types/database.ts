// Database TypeScript Types
// Auto-generated from Supabase schema
// Date: 2025-11-24

// =============================================================================
// BASE TYPES
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// =============================================================================
// ORGANIZATIONS
// =============================================================================

export interface Organization {
  id: string;
  name: string;
  tax_id: string | null;
  npi: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertOrganization {
  id?: string;
  name: string;
  tax_id?: string | null;
  npi?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateOrganization {
  id?: string;
  name?: string;
  tax_id?: string | null;
  npi?: string | null;
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// PROVIDERS
// =============================================================================

export type ProviderRole = 'RBT' | 'BCBA' | 'ADMIN';

export interface Provider {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: ProviderRole;
  npi: string | null;
  credentials: Json | null;
  created_at: string;
}

export interface InsertProvider {
  id?: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: ProviderRole;
  npi?: string | null;
  credentials?: Json | null;
  created_at?: string;
}

export interface UpdateProvider {
  id?: string;
  organization_id?: string;
  email?: string;
  full_name?: string;
  role?: ProviderRole;
  npi?: string | null;
  credentials?: Json | null;
  created_at?: string;
}

// =============================================================================
// PATIENTS
// =============================================================================

export interface Patient {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO date string
  state: string;
  primary_diagnosis_code: string | null;
  guardian_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertPatient {
  id?: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  state: string;
  primary_diagnosis_code?: string | null;
  guardian_email?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdatePatient {
  id?: string;
  organization_id?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  state?: string;
  primary_diagnosis_code?: string | null;
  guardian_email?: string | null;
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// PATIENT INSURANCE
// =============================================================================

export interface EligibilityVerification {
  coverageActive: boolean;
  effectiveDate: string;
  planName: string;
  copayAmount?: number;
  deductibleRemaining?: number;
  verifiedBy: string;
  verificationDate: string;
  notes: string;
}

export interface PatientInsurance {
  id: string;
  patient_id: string;
  payer_name: string;
  payer_id: string | null;
  member_id: string;
  group_number: string | null;
  plan_name: string | null;
  effective_date: string | null; // ISO date string
  termination_date: string | null; // ISO date string
  is_active: boolean;
  eligibility_verification: EligibilityVerification | null;
  last_verified_at: string | null;
  created_at: string;
}

export interface InsertPatientInsurance {
  id?: string;
  patient_id: string;
  payer_name: string;
  payer_id?: string | null;
  member_id: string;
  group_number?: string | null;
  plan_name?: string | null;
  effective_date?: string | null;
  termination_date?: string | null;
  is_active?: boolean;
  eligibility_verification?: EligibilityVerification | null;
  last_verified_at?: string | null;
  created_at?: string;
}

export interface UpdatePatientInsurance {
  id?: string;
  patient_id?: string;
  payer_name?: string;
  payer_id?: string | null;
  member_id?: string;
  group_number?: string | null;
  plan_name?: string | null;
  effective_date?: string | null;
  termination_date?: string | null;
  is_active?: boolean;
  eligibility_verification?: EligibilityVerification | null;
  last_verified_at?: string | null;
  created_at?: string;
}

// =============================================================================
// AUTHORIZATIONS
// =============================================================================

export type AuthorizationStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED';

export interface Authorization {
  id: string;
  patient_id: string;
  insurance_id: string | null;
  service_code: string;
  total_units: number;
  used_units: number;
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  status: AuthorizationStatus;
  authorization_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertAuthorization {
  id?: string;
  patient_id: string;
  insurance_id?: string | null;
  service_code: string;
  total_units: number;
  used_units?: number;
  start_date: string;
  end_date: string;
  status?: AuthorizationStatus;
  authorization_number?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateAuthorization {
  id?: string;
  patient_id?: string;
  insurance_id?: string | null;
  service_code?: string;
  total_units?: number;
  used_units?: number;
  start_date?: string;
  end_date?: string;
  status?: AuthorizationStatus;
  authorization_number?: string | null;
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// APPOINTMENTS
// =============================================================================

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentLocation = 'HOME' | 'CLINIC' | 'SCHOOL' | 'TELEHEALTH';

export interface Appointment {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string | null;
  authorization_id: string | null;
  service_code: string;
  start_time: string; // ISO timestamp
  end_time: string; // ISO timestamp
  status: AppointmentStatus;
  location: AppointmentLocation | null;
  recurrence_rule: string | null;
  created_at: string;
}

export interface InsertAppointment {
  id?: string;
  organization_id: string;
  patient_id: string;
  provider_id?: string | null;
  authorization_id?: string | null;
  service_code: string;
  start_time: string;
  end_time: string;
  status?: AppointmentStatus;
  location?: AppointmentLocation | null;
  recurrence_rule?: string | null;
  created_at?: string;
}

export interface UpdateAppointment {
  id?: string;
  organization_id?: string;
  patient_id?: string;
  provider_id?: string | null;
  authorization_id?: string | null;
  service_code?: string;
  start_time?: string;
  end_time?: string;
  status?: AppointmentStatus;
  location?: AppointmentLocation | null;
  recurrence_rule?: string | null;
  created_at?: string;
}

// =============================================================================
// SESSIONS
// =============================================================================

export type SessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'REQUIRES_REVIEW';

export interface SessionMetrics {
  tantrumCount: number;
  durationTotal: number;
  mandingCorrect: number;
  mandingTotal: number;
  lastUpdated: string;
}

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface Session {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  provider_id: string | null;
  authorization_id: string | null;
  service_code: string;
  start_time: string; // ISO timestamp
  end_time: string | null; // ISO timestamp
  duration_minutes: number | null;
  billed_units: number | null;
  status: SessionStatus;
  location: string | null;
  latest_metrics: SessionMetrics | null;
  ai_note_json: SOAPNote | null;
  voice_note_url: string | null;
  voice_transcript: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertSession {
  id?: string;
  appointment_id?: string | null;
  patient_id: string;
  provider_id?: string | null;
  authorization_id?: string | null;
  service_code: string;
  start_time: string;
  end_time?: string | null;
  duration_minutes?: number | null;
  billed_units?: number | null;
  status?: SessionStatus;
  location?: string | null;
  latest_metrics?: SessionMetrics | null;
  ai_note_json?: SOAPNote | null;
  voice_note_url?: string | null;
  voice_transcript?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateSession {
  id?: string;
  appointment_id?: string | null;
  patient_id?: string;
  provider_id?: string | null;
  authorization_id?: string | null;
  service_code?: string;
  start_time?: string;
  end_time?: string | null;
  duration_minutes?: number | null;
  billed_units?: number | null;
  status?: SessionStatus;
  location?: string | null;
  latest_metrics?: SessionMetrics | null;
  ai_note_json?: SOAPNote | null;
  voice_note_url?: string | null;
  voice_transcript?: string | null;
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// SESSION EVENTS
// =============================================================================

export interface SessionEvent {
  id: string;
  session_id: string;
  event_type: string;
  event_timestamp: string; // ISO timestamp
  raw_value: number | null;
  metadata: Json | null;
  recorded_by: string | null;
}

export interface InsertSessionEvent {
  id?: string;
  session_id: string;
  event_type: string;
  event_timestamp?: string;
  raw_value?: number | null;
  metadata?: Json | null;
  recorded_by?: string | null;
}

export interface UpdateSessionEvent {
  id?: string;
  session_id?: string;
  event_type?: string;
  event_timestamp?: string;
  raw_value?: number | null;
  metadata?: Json | null;
  recorded_by?: string | null;
}

// =============================================================================
// CLAIMS
// =============================================================================

export type ClaimStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'PAID';

export interface Claim {
  id: string;
  session_id: string | null;
  authorization_id: string | null;
  payer_id: string;
  claim_number: string | null;
  edi_payload: Json;
  status: ClaimStatus;
  submitted_at: string | null;
  response_payload: Json | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface InsertClaim {
  id?: string;
  session_id?: string | null;
  authorization_id?: string | null;
  payer_id: string;
  claim_number?: string | null;
  edi_payload: Json;
  status?: ClaimStatus;
  submitted_at?: string | null;
  response_payload?: Json | null;
  rejection_reason?: string | null;
  created_at?: string;
}

export interface UpdateClaim {
  id?: string;
  session_id?: string | null;
  authorization_id?: string | null;
  payer_id?: string;
  claim_number?: string | null;
  edi_payload?: Json;
  status?: ClaimStatus;
  submitted_at?: string | null;
  response_payload?: Json | null;
  rejection_reason?: string | null;
  created_at?: string;
}

// =============================================================================
// AUDIT LOGS
// =============================================================================

export interface AuditLog {
  id: string;
  timestamp: string; // ISO timestamp
  user_id: string | null;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Json | null;
  organization_id: string | null;
}

export interface InsertAuditLog {
  id?: string;
  timestamp?: string;
  user_id?: string | null;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Json | null;
  organization_id?: string | null;
}

// Note: AuditLog does NOT have UpdateAuditLog type because audit logs are immutable

// =============================================================================
// DATABASE FUNCTION RETURN TYPES
// =============================================================================

export interface ReserveUnitsResult {
  success: boolean;
  error?: 'AUTH_NOT_FOUND' | 'AUTH_EXPIRED' | 'INSUFFICIENT_UNITS';
  message?: string;
  units_reserved?: number;
  remaining_units?: number;
  available?: number;
}

// =============================================================================
// SUPABASE DATABASE TYPE
// =============================================================================

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: InsertOrganization;
        Update: UpdateOrganization;
      };
      providers: {
        Row: Provider;
        Insert: InsertProvider;
        Update: UpdateProvider;
      };
      patients: {
        Row: Patient;
        Insert: InsertPatient;
        Update: UpdatePatient;
      };
      patient_insurance: {
        Row: PatientInsurance;
        Insert: InsertPatientInsurance;
        Update: UpdatePatientInsurance;
      };
      authorizations: {
        Row: Authorization;
        Insert: InsertAuthorization;
        Update: UpdateAuthorization;
      };
      appointments: {
        Row: Appointment;
        Insert: InsertAppointment;
        Update: UpdateAppointment;
      };
      sessions: {
        Row: Session;
        Insert: InsertSession;
        Update: UpdateSession;
      };
      session_events: {
        Row: SessionEvent;
        Insert: InsertSessionEvent;
        Update: UpdateSessionEvent;
      };
      claims: {
        Row: Claim;
        Insert: InsertClaim;
        Update: UpdateClaim;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: InsertAuditLog;
        Update: never; // Audit logs are immutable
      };
    };
    Functions: {
      user_organization_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      reserve_session_units: {
        Args: {
          p_authorization_id: string;
          p_expected_units: number;
        };
        Returns: ReserveUnitsResult;
      };
      adjust_authorization_units: {
        Args: {
          p_authorization_id: string;
          p_adjustment: number;
        };
        Returns: void;
      };
      check_scheduling_conflict: {
        Args: {
          p_provider_id: string;
          p_patient_id: string;
          p_start: string;
          p_end: string;
        };
        Returns: boolean;
      };
    };
  };
}
