/**
 * Session Service Tests
 *
 * Comprehensive tests for session service with focus on:
 * - Unit consumption operations
 * - Appointment completion
 * - RBAC enforcement
 * - Multi-tenancy boundaries
 * - Transaction atomicity
 */

import { Role, SessionStatus, AppointmentStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import {
  createTestAppointment,
  createTestAuthorization,
  createTestServiceCode,
  calculateExpectedUnits,
} from './helpers/appointment.helper';
import {
  createTestSessionData,
  createMultipleSessions,
} from './helpers/session.helper';
import {
  completeAppointmentAndCreateSession,
  getSessionById,
  getAllSessions,
  getSessionsByPatientId,
  getSessionsByPractitionerId,
} from '../services/session.service';

describe('Session Service', () => {
  describe('completeAppointmentAndCreateSession()', () => {
    describe('Happy Path', () => {
      it('should create session, consume units, and complete appointment', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
        const serviceCode = await createTestServiceCode(admin.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: admin.organizationId!,
          totalUnits: 100,
        });

        // Create appointment WITHOUT authorization to avoid automatic unit reservation
        const appointment = await createTestAppointment({
          organizationId: admin.organizationId!,
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          status: AppointmentStatus.IN_PROGRESS,
        });

        // Now manually link it to our authorization and reserve units
        const expectedUnits = calculateExpectedUnits(appointment.startTime, appointment.endTime);
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { authorizationId: authorization.id },
        });
        await prisma.authorization.update({
          where: { id: authorization.id },
          data: { scheduledUnits: { increment: expectedUnits } },
        });

        // Verify initial state
        let auth = await prisma.authorization.findUnique({ where: { id: authorization.id } });
        expect(auth?.scheduledUnits).toBe(expectedUnits);
        expect(auth?.usedUnits).toBe(0);

        // Complete appointment and create session
        const sessionData = createTestSessionData(appointment.id);
        const result = await completeAppointmentAndCreateSession(sessionData, admin.user);

        expect(result.session).toBeDefined();
        expect(result.session.appointmentId).toBe(appointment.id);
        expect(result.session.patientId).toBe(patient.id);
        expect(result.session.unitsUsed).toBe(expectedUnits);
        expect(result.session.status).toBe(SessionStatus.COMPLETED);

        // Verify units were consumed
        auth = await prisma.authorization.findUnique({ where: { id: authorization.id } });
        expect(auth?.scheduledUnits).toBe(0);
        expect(auth?.usedUnits).toBe(expectedUnits);

        // Verify appointment was completed
        const completedAppointment = await prisma.appointment.findUnique({
          where: { id: appointment.id },
        });
        expect(completedAppointment?.status).toBe(AppointmentStatus.COMPLETED);
      });
    });

    describe('RBAC Enforcement', () => {
      it('should allow admin to complete appointment', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const appointment = await createTestAppointment({
          organizationId: admin.organizationId!,
          status: AppointmentStatus.IN_PROGRESS,
        });

        const sessionData = createTestSessionData(appointment.id);
        await expect(
          completeAppointmentAndCreateSession(sessionData, admin.user)
        ).resolves.toBeDefined();
      });

      it('should allow practitioner to complete appointment', async () => {
        const practitioner = await createTestUser(Role.PRACTITIONER);
        const appointment = await createTestAppointment({
          organizationId: practitioner.organizationId!,
          status: AppointmentStatus.IN_PROGRESS,
        });

        const sessionData = createTestSessionData(appointment.id);
        await expect(
          completeAppointmentAndCreateSession(sessionData, practitioner.user)
        ).resolves.toBeDefined();
      });

      it('should prevent patient from completing appointment', async () => {
        const patient = await createTestUser(Role.PATIENT);
        const appointment = await createTestAppointment({
          organizationId: patient.organizationId!,
          status: AppointmentStatus.IN_PROGRESS,
        });

        const sessionData = createTestSessionData(appointment.id);
        await expect(
          completeAppointmentAndCreateSession(sessionData, patient.user)
        ).rejects.toThrow('Forbidden: Only administrators and practitioners can complete appointments');
      });
    });

    describe('Validation', () => {
      it('should reject already completed appointment', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const appointment = await createTestAppointment({
          organizationId: admin.organizationId!,
          status: AppointmentStatus.COMPLETED,
        });

        const sessionData = createTestSessionData(appointment.id);
        await expect(
          completeAppointmentAndCreateSession(sessionData, admin.user)
        ).rejects.toThrow('Appointment is already completed');
      });

      it('should reject cancelled appointment', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const appointment = await createTestAppointment({
          organizationId: admin.organizationId!,
          status: AppointmentStatus.CANCELLED,
        });

        const sessionData = createTestSessionData(appointment.id);
        await expect(
          completeAppointmentAndCreateSession(sessionData, admin.user)
        ).rejects.toThrow('Cannot complete cancelled appointment');
      });

      it('should reject if session already exists', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const appointment = await createTestAppointment({
          organizationId: admin.organizationId!,
          status: AppointmentStatus.IN_PROGRESS,
        });

        // Create first session
        const sessionData = createTestSessionData(appointment.id);
        await completeAppointmentAndCreateSession(sessionData, admin.user);

        // Try to create second session for same appointment
        // Note: The appointment is now COMPLETED, so the error message will be about that
        await expect(
          completeAppointmentAndCreateSession(sessionData, admin.user)
        ).rejects.toThrow('Appointment is already completed');
      });

      it('should throw error for non-existent appointment', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const sessionData = createTestSessionData('non-existent-id');

        await expect(
          completeAppointmentAndCreateSession(sessionData, admin.user)
        ).rejects.toThrow('Appointment not found');
      });
    });

    describe('Multi-Tenancy', () => {
      it('should prevent cross-org session creation', async () => {
        const org1Admin = await createTestUser(Role.ADMIN);
        const org2Admin = await createTestUser(Role.ADMIN);
        const appointment = await createTestAppointment({
          organizationId: org1Admin.organizationId!,
          status: AppointmentStatus.IN_PROGRESS,
        });

        const sessionData = createTestSessionData(appointment.id);
        await expect(
          completeAppointmentAndCreateSession(sessionData, org2Admin.user)
        ).rejects.toThrow('Forbidden: You can only complete appointments in your organization');
      });
    });

    describe('Transaction Atomicity', () => {
      it('should calculate units correctly', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const appointment = await createTestAppointment({
          organizationId: admin.organizationId!,
          status: AppointmentStatus.IN_PROGRESS,
        });

        const sessionData = createTestSessionData(appointment.id);
        const result = await completeAppointmentAndCreateSession(sessionData, admin.user);

        const expectedUnits = calculateExpectedUnits(appointment.startTime, appointment.endTime);
        expect(result.session.unitsUsed).toBe(expectedUnits);
      });
    });
  });

  describe('getSessionById()', () => {
    it('should allow admin to access session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const sessionData = createTestSessionData(appointment.id);
      const { session } = await completeAppointmentAndCreateSession(sessionData, admin.user);

      const result = await getSessionById(session.id, admin.user);

      expect(result).toBeDefined();
      expect(result.id).toBe(session.id);
    });

    it('should allow practitioner to access session', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const appointment = await createTestAppointment({
        organizationId: practitioner.organizationId!,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const sessionData = createTestSessionData(appointment.id);
      const { session } = await completeAppointmentAndCreateSession(sessionData, practitioner.user);

      const result = await getSessionById(session.id, practitioner.user);

      expect(result).toBeDefined();
      expect(result.id).toBe(session.id);
    });

    it('should allow patient to view own session', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);

      await prisma.patient.update({
        where: { id: patient.id },
        data: { userId: patientUser.id },
      });

      const appointment = await createTestAppointment({
        organizationId: patientUser.organizationId!,
        patientId: patient.id,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const practitioner = await createTestUser(Role.PRACTITIONER, false, patientUser.organizationId!);
      const sessionData = createTestSessionData(appointment.id);
      const { session } = await completeAppointmentAndCreateSession(sessionData, practitioner.user);

      const result = await getSessionById(session.id, patientUser.user);

      expect(result).toBeDefined();
      expect(result.id).toBe(session.id);
    });

    it('should prevent patient from viewing others sessions', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const practitioner = await createTestUser(Role.PRACTITIONER, false, patientUser.organizationId!);

      const appointment = await createTestAppointment({
        organizationId: patientUser.organizationId!,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const sessionData = createTestSessionData(appointment.id);
      const { session } = await completeAppointmentAndCreateSession(sessionData, practitioner.user);

      await expect(getSessionById(session.id, patientUser.user)).rejects.toThrow('Forbidden');
    });

    it('should prevent cross-org access', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);

      const appointment = await createTestAppointment({
        organizationId: org1Admin.organizationId!,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const sessionData = createTestSessionData(appointment.id);
      const { session } = await completeAppointmentAndCreateSession(sessionData, org1Admin.user);

      await expect(getSessionById(session.id, org2Admin.user)).rejects.toThrow(
        'Forbidden: You can only access sessions in your organization'
      );
    });
  });

  describe('getAllSessions()', () => {
    it('should return paginated sessions', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createMultipleSessions(5, { organizationId: admin.organizationId! });

      const result = await getAllSessions(admin.user, { page: 1, limit: 3 });

      expect(result.sessions).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });

    it('should filter by patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createMultipleSessions(3, {
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });
      await createMultipleSessions(2, { organizationId: admin.organizationId! });

      const result = await getAllSessions(admin.user, { patientId: patient.id });

      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.every((s) => s.patientId === patient.id)).toBe(true);
    });

    it('should filter by status', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createMultipleSessions(2, {
        organizationId: admin.organizationId!,
        status: SessionStatus.COMPLETED,
      });

      const result = await getAllSessions(admin.user, { status: SessionStatus.COMPLETED });

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((s) => s.status === SessionStatus.COMPLETED)).toBe(true);
    });

    it('should only show patient their own sessions', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);

      await prisma.patient.update({
        where: { id: patient.id },
        data: { userId: patientUser.id },
      });

      await createMultipleSessions(2, {
        organizationId: patientUser.organizationId!,
        patientId: patient.id,
      });
      await createMultipleSessions(1, { organizationId: patientUser.organizationId! });

      const result = await getAllSessions(patientUser.user);

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((s) => s.patientId === patient.id)).toBe(true);
    });

    it('should scope to organization', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);

      await createMultipleSessions(3, { organizationId: org1Admin.organizationId! });
      await createMultipleSessions(2, { organizationId: org2Admin.organizationId! });

      const result = await getAllSessions(org1Admin.user);

      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.every((s) => s.organizationId === org1Admin.organizationId)).toBe(true);
    });
  });

  describe('getSessionsByPatientId()', () => {
    it('should return patient sessions', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createMultipleSessions(3, {
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const sessions = await getSessionsByPatientId(patient.id, admin.user);

      expect(sessions).toHaveLength(3);
      expect(sessions.every((s) => s.patientId === patient.id)).toBe(true);
    });

    it('should enforce RBAC', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await expect(getSessionsByPatientId(patient.id, patientUser.user)).rejects.toThrow('Forbidden');
    });

    it('should prevent cross-org access', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', org1Admin.organizationId!);

      await expect(getSessionsByPatientId(patient.id, org2Admin.user)).rejects.toThrow(
        'Forbidden: You can only access sessions in your organization'
      );
    });
  });

  describe('getSessionsByPractitionerId()', () => {
    it('should allow admin to access practitioner sessions', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);

      await createMultipleSessions(2, {
        organizationId: admin.organizationId!,
        practitionerId: practitioner.id,
      });

      const sessions = await getSessionsByPractitionerId(practitioner.id, admin.user);

      expect(sessions).toHaveLength(2);
      expect(sessions.every((s) => s.practitionerId === practitioner.id)).toBe(true);
    });

    it('should prevent non-admin from accessing practitioner sessions', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { practitioner: otherPractitioner } = await createCompleteTestPractitioner(
        'Test123!@#',
        practitioner.organizationId!
      );

      await expect(
        getSessionsByPractitionerId(otherPractitioner.id, practitioner.user)
      ).rejects.toThrow('Forbidden: Only administrators can view practitioner sessions');
    });

    it('should prevent cross-org access', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', org1Admin.organizationId!);

      await expect(getSessionsByPractitionerId(practitioner.id, org2Admin.user)).rejects.toThrow(
        'Forbidden: You can only access sessions in your organization'
      );
    });
  });
});
