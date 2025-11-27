/**
 * Session Test Helpers
 *
 * Helper functions for creating sessions in tests
 */

import { Session, SessionStatus, Appointment } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from '../setup';
import { CreateSessionData } from '../../services/session.service';
import { createTestAppointment, calculateExpectedUnits, testDate } from './appointment.helper';

/**
 * Default values for test sessions
 */
export function sessionDefaults(): Partial<CreateSessionData> {
  return {
    narrative: 'Test session narrative: Client engaged well with activities',
    latestMetrics: {
      behavior: 'appropriate',
      engagement: 'high',
      progress: 'on-track',
    },
    voiceNoteUrl: `https://example.com/voice-notes/${faker.string.uuid()}.mp3`,
    voiceTranscript: 'This is a test voice transcript of the session notes.',
  };
}

/**
 * Create session data object (doesn't persist to DB)
 * Useful for testing service functions directly
 */
export function createTestSessionData(appointmentId: string, overrides?: Partial<CreateSessionData>): CreateSessionData {
  const defaults = sessionDefaults();

  return {
    appointmentId,
    narrative: overrides?.narrative || defaults.narrative,
    latestMetrics: overrides?.latestMetrics || defaults.latestMetrics,
    voiceNoteUrl: overrides?.voiceNoteUrl || defaults.voiceNoteUrl,
    voiceTranscript: overrides?.voiceTranscript || defaults.voiceTranscript,
  };
}

/**
 * Create an appointment ready to be completed (IN_PROGRESS status)
 * This is useful for testing session creation
 */
export async function createCompletedAppointment(options?: {
  organizationId?: string;
  patientId?: string;
  practitionerId?: string;
  startTime?: Date;
  endTime?: Date;
}): Promise<Appointment> {
  // First create a scheduled appointment
  const appointment = await createTestAppointment({
    ...options,
    status: 'IN_PROGRESS', // Ready to be completed
  });

  return appointment;
}

/**
 * Create a complete test session with all dependencies
 * This creates: Appointment, and then Session (which completes the appointment and consumes units)
 *
 * Note: This does NOT use the service layer - it creates data directly in DB
 * For testing the service layer, use createTestSessionData() instead
 */
export async function createTestSession(options?: {
  organizationId?: string;
  patientId?: string;
  practitionerId?: string;
  appointmentId?: string;
  startTime?: Date;
  endTime?: Date;
  narrative?: string;
  latestMetrics?: any;
  voiceNoteUrl?: string;
  voiceTranscript?: string;
  status?: SessionStatus;
  unitsUsed?: number;
}): Promise<Session> {
  const defaults = sessionDefaults();

  // Create or use appointment
  let appointment: Appointment;
  if (options?.appointmentId) {
    const existing = await prisma.appointment.findUnique({
      where: { id: options.appointmentId },
      include: {
        patient: true,
        practitioner: true,
        serviceCode: true,
        authorization: true,
      },
    });
    if (!existing) {
      throw new Error(`Appointment ${options.appointmentId} not found`);
    }
    appointment = existing;
  } else {
    // Create a new appointment (will be IN_PROGRESS)
    appointment = await createTestAppointment({
      organizationId: options?.organizationId,
      patientId: options?.patientId,
      practitionerId: options?.practitionerId,
      startTime: options?.startTime,
      endTime: options?.endTime,
      status: 'IN_PROGRESS',
    });
  }

  // Calculate units used (or use provided value)
  const unitsUsed = options?.unitsUsed !== undefined
    ? options.unitsUsed
    : calculateExpectedUnits(appointment.startTime, appointment.endTime);

  // Update authorization: move units from scheduled to used
  if (appointment.authorizationId) {
    await prisma.authorization.update({
      where: { id: appointment.authorizationId },
      data: {
        scheduledUnits: { decrement: unitsUsed },
        usedUnits: { increment: unitsUsed },
      },
    });
  }

  // Mark appointment as completed
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'COMPLETED' },
  });

  // Create session
  const session = await prisma.session.create({
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
      narrative: options?.narrative || defaults.narrative,
      latestMetrics: options?.latestMetrics || defaults.latestMetrics,
      voiceNoteUrl: options?.voiceNoteUrl || defaults.voiceNoteUrl,
      voiceTranscript: options?.voiceTranscript || defaults.voiceTranscript,
      status: options?.status || SessionStatus.COMPLETED,
    },
    include: {
      appointment: true,
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true,
    },
  });

  return session;
}

/**
 * Create multiple sessions for pagination/filtering tests
 */
export async function createMultipleSessions(
  count: number,
  options?: {
    organizationId?: string;
    patientId?: string;
    practitionerId?: string;
    status?: SessionStatus;
  }
): Promise<Session[]> {
  const sessions: Session[] = [];

  for (let i = 0; i < count; i++) {
    const startTime = new Date(testDate.now.getTime() + i * 2 * 60 * 60 * 1000); // 2 hours apart
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

    const session = await createTestSession({
      ...options,
      startTime,
      endTime,
    });

    sessions.push(session);
  }

  return sessions;
}

/**
 * Create a test appointment without consuming units
 * Useful for testing the complete appointment and create session flow
 */
export async function createAppointmentForSessionTest(options?: {
  organizationId?: string;
  patientId?: string;
  practitionerId?: string;
  startTime?: Date;
  endTime?: Date;
  status?: 'SCHEDULED' | 'IN_PROGRESS';
}): Promise<Appointment> {
  const appointment = await createTestAppointment({
    ...options,
    status: options?.status || 'SCHEDULED',
  });

  return appointment;
}
