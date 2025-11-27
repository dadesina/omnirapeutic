/**
 * Session Service
 *
 * Handles completed therapy sessions with integration to authorization unit operations.
 * Sessions are created when appointments are completed and represent billable services.
 * Critical: Session creation must consume units from authorizations.
 */

import { Role, Session, SessionStatus, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';
import { withRetryMetrics } from '../utils/retry';
import { consumeUnits } from './authorization.service';
import { markAppointmentComplete } from './appointment.service';
import { logAuditEvent } from './audit.service';
import { createProgressNote } from './progressNote.service';

export interface CreateSessionData {
  appointmentId: string;
  narrative?: string;
  latestMetrics?: any;
  voiceNoteUrl?: string;
  voiceTranscript?: string;
}

export interface SessionFilters {
  page?: number;
  limit?: number;
  patientId?: string;
  practitionerId?: string;
  status?: SessionStatus;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Calculate units used based on session duration
 */
const calculateUnitsFromDuration = (startTime: Date, endTime: Date): number => {
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  // Assuming 15-minute unit increments (standard for ABA therapy)
  return Math.ceil(durationMinutes / 15);
};

/**
 * Complete appointment and create session (Admin or Practitioner only)
 * This is the main public function that should be called to complete an appointment.
 * Atomically: creates session, consumes units, marks appointment complete
 */
export const completeAppointmentAndCreateSession = async (
  data: CreateSessionData,
  requestingUser: JwtPayload
): Promise<{ session: Session; appointment: any }> => {
  // RBAC: Only Admin or Practitioner can complete appointments
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can complete appointments');
  }

  return await withRetryMetrics(async () => {
    return await prisma.$transaction(async (tx) => {
      // 1. Get appointment
      const appointment = await tx.appointment.findUnique({
        where: { id: data.appointmentId },
        include: {
          patient: true,
          practitioner: true,
          serviceCode: true,
          authorization: true
        }
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Organization check
      if (!requestingUser.isSuperAdmin && appointment.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only complete appointments in your organization');
      }

      // Status checks
      if (appointment.status === 'COMPLETED') {
        throw new Error('Appointment is already completed');
      }

      if (appointment.status === 'CANCELLED') {
        throw new Error('Cannot complete cancelled appointment');
      }

      // Check if session already exists
      const existingSession = await tx.session.findUnique({
        where: { appointmentId: data.appointmentId }
      });

      if (existingSession) {
        throw new Error('Session already exists for this appointment');
      }

      // 2. Calculate units used
      const unitsUsed = calculateUnitsFromDuration(appointment.startTime, appointment.endTime);

      // 3. Create session record
      const session = await tx.session.create({
        data: {
          organizationId: appointment.organizationId,
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          practitionerId: appointment.practitionerId,
          serviceCodeId: appointment.serviceCodeId,
          authorizationId: appointment.authorizationId,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          unitsUsed,
          narrative: data.narrative,
          latestMetrics: data.latestMetrics,
          voiceNoteUrl: data.voiceNoteUrl,
          voiceTranscript: data.voiceTranscript,
          status: SessionStatus.COMPLETED
        },
        include: {
          appointment: true,
          patient: true,
          practitioner: true,
          serviceCode: true,
          authorization: true
        }
      });

      // 4. Consume units from authorization
      if (appointment.authorizationId) {
        await consumeUnits(appointment.authorizationId, unitsUsed, requestingUser);
      }

      // 5. Mark appointment as completed
      await markAppointmentComplete(appointment.id, requestingUser);

      // 6. Audit log
      await logAuditEvent({
        userId: requestingUser.userId,
        action: 'CREATE_SESSION',
        resource: 'session',
        resourceId: session.id,
        organizationId: session.organizationId,
        details: {
          appointmentId: appointment.id,
          patientId: session.patientId,
          practitionerId: session.practitionerId,
          authorizationId: session.authorizationId,
          unitsConsumed: unitsUsed
        }
      });

      // 7. Auto-create progress note
      // This happens outside the main transaction to avoid blocking if it fails
      // Progress note creation is optional and shouldn't fail the session completion
      try {
        if (session.endTime) {
          const durationMinutes = Math.round((session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60));
          const autoNarrative = data.narrative ||
            `Session completed on ${session.endTime.toLocaleDateString()}. ` +
            `Duration: ${durationMinutes} minutes. ` +
            `Service: ${appointment.serviceCode?.code || 'N/A'}. ` +
            `Units consumed: ${unitsUsed}.`;

          await createProgressNote({
            sessionId: session.id,
            narrative: autoNarrative,
            interventionsUsed: appointment.serviceCode?.description
          }, requestingUser);
        }
      } catch (progressNoteError) {
        // Log error but don't fail session creation
        console.error('Failed to auto-create progress note for session:', session.id, progressNoteError);
      }

      return { session, appointment };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
};

/**
 * Get session by ID (RBAC enforced)
 */
export const getSessionById = async (
  sessionId: string,
  requestingUser: JwtPayload
): Promise<Session> => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      appointment: true,
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true,
      events: true
    }
  });

  if (!session) {
    throw new Error('Session not found');
  }

  // RBAC checks
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isPatientOwner = session.patient.userId === requestingUser.userId;
  const isSameOrg = session.organizationId === requestingUser.organizationId;

  // Super Admins can access any session
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access sessions in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isPatientOwner) {
      throw new Error('Forbidden: You can only view your own sessions');
    }
  }

  return session;
};

/**
 * Get all sessions with filtering and pagination
 */
export const getAllSessions = async (
  requestingUser: JwtPayload,
  filters: SessionFilters = {}
): Promise<{ sessions: Session[]; total: number; page: number; limit: number }> => {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  // Organization scoping (non-super admins)
  if (!requestingUser.isSuperAdmin) {
    where.organizationId = requestingUser.organizationId;
  }

  // Patient role can only see their own sessions
  if (requestingUser.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: requestingUser.userId }
    });
    if (patient) {
      where.patientId = patient.id;
    }
  }

  // Apply filters
  if (filters.patientId) {
    where.patientId = filters.patientId;
  }

  if (filters.practitionerId) {
    where.practitionerId = filters.practitionerId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.startDate || filters.endDate) {
    where.startTime = {};
    if (filters.startDate) {
      where.startTime.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.startTime.lte = filters.endDate;
    }
  }

  // Execute query
  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      include: {
        appointment: true,
        patient: true,
        practitioner: true,
        serviceCode: true,
        authorization: true
      },
      orderBy: [
        { startTime: 'desc' }
      ],
      skip,
      take: limit
    }),
    prisma.session.count({ where })
  ]);

  return {
    sessions,
    total,
    page,
    limit
  };
};

/**
 * Get sessions by patient ID (with RBAC)
 */
export const getSessionsByPatientId = async (
  patientId: string,
  requestingUser: JwtPayload
): Promise<Session[]> => {
  // Check if patient exists
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC checks
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isOwner = patient.userId === requestingUser.userId;
  const isSameOrg = patient.organizationId === requestingUser.organizationId;

  // Super Admins can access any patient's sessions
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access sessions in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isOwner) {
      throw new Error('Forbidden: You can only view your own sessions');
    }
  }

  const sessions = await prisma.session.findMany({
    where: { patientId },
    include: {
      appointment: true,
      practitioner: true,
      serviceCode: true,
      authorization: true
    },
    orderBy: [
      { startTime: 'desc' }
    ]
  });

  return sessions;
};

/**
 * Get sessions by practitioner ID (with RBAC)
 */
export const getSessionsByPractitionerId = async (
  practitionerId: string,
  requestingUser: JwtPayload
): Promise<Session[]> => {
  // Check if practitioner exists
  const practitioner = await prisma.practitioner.findUnique({
    where: { id: practitionerId }
  });

  if (!practitioner) {
    throw new Error('Practitioner not found');
  }

  // RBAC checks
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isSameOrg = practitioner.organizationId === requestingUser.organizationId;

  // Only admins or super admins can view practitioner sessions
  if (!isSuperAdmin && !isAdmin) {
    throw new Error('Forbidden: Only administrators can view practitioner sessions');
  }

  // Organization boundary check
  if (!isSuperAdmin && !isSameOrg) {
    throw new Error('Forbidden: You can only access sessions in your organization');
  }

  const sessions = await prisma.session.findMany({
    where: { practitionerId },
    include: {
      appointment: true,
      patient: true,
      serviceCode: true,
      authorization: true
    },
    orderBy: [
      { startTime: 'desc' }
    ]
  });

  return sessions;
};
