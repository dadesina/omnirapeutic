/**
 * Test Helpers Smoke Tests
 *
 * Validates that appointment and session helpers work correctly
 * before using them in full test suites
 */

import { createTestAppointment, createTestAuthorization, calculateExpectedUnits, testDate } from './helpers/appointment.helper';
import { createTestSession, createTestSessionData } from './helpers/session.helper';

describe('Test Helpers - Smoke Tests', () => {
  describe('Appointment Helpers', () => {
    it('should create appointment with defaults', async () => {
      const appointment = await createTestAppointment();

      expect(appointment).toBeDefined();
      expect(appointment.id).toBeDefined();
      expect(appointment.status).toBe('SCHEDULED');
      expect(appointment.patientId).toBeDefined();
      expect(appointment.practitionerId).toBeDefined();
      expect(appointment.serviceCodeId).toBeDefined();
      expect(appointment.authorizationId).toBeDefined();
      expect(appointment.organizationId).toBeDefined();
    });

    it('should calculate units correctly', () => {
      // 1 hour = 60 minutes = 4 units (15-minute increments)
      const units = calculateExpectedUnits(testDate.now, testDate.oneHourLater);
      expect(units).toBe(4);

      // 30 minutes = 2 units
      const thirtyMinLater = new Date(testDate.now.getTime() + 30 * 60 * 1000);
      const units2 = calculateExpectedUnits(testDate.now, thirtyMinLater);
      expect(units2).toBe(2);

      // 17 minutes = ceil(17/15) = 2 units
      const seventeenMinLater = new Date(testDate.now.getTime() + 17 * 60 * 1000);
      const units3 = calculateExpectedUnits(testDate.now, seventeenMinLater);
      expect(units3).toBe(2);
    });

    it('should create authorization with correct units', async () => {
      const appointment = await createTestAppointment({ totalUnits: 50 });
      const auth = await createTestAuthorization({
        patientId: appointment.patientId,
        serviceCodeId: appointment.serviceCodeId,
        organizationId: appointment.organizationId,
        totalUnits: 50,
      });

      expect(auth).toBeDefined();
      expect(auth.totalUnits).toBe(50);
      expect(auth.scheduledUnits).toBe(0);
      expect(auth.usedUnits).toBe(0);
      expect(auth.status).toBe('ACTIVE');
    });
  });

  describe('Session Helpers', () => {
    it('should create session with defaults', async () => {
      const session = await createTestSession();

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.status).toBe('COMPLETED');
      expect(session.appointmentId).toBeDefined();
      expect(session.patientId).toBeDefined();
      expect(session.practitionerId).toBeDefined();
      expect(session.serviceCodeId).toBeDefined();
      expect(session.authorizationId).toBeDefined();
      expect(session.unitsUsed).toBeGreaterThan(0);
      expect(session.narrative).toBeDefined();
    });

    it('should create session data object', () => {
      const appointmentId = 'test-appointment-id';
      const sessionData = createTestSessionData(appointmentId);

      expect(sessionData).toBeDefined();
      expect(sessionData.appointmentId).toBe(appointmentId);
      expect(sessionData.narrative).toBeDefined();
      expect(sessionData.latestMetrics).toBeDefined();
    });

    it('should create session with custom values', async () => {
      const customNarrative = 'Custom session narrative for testing';

      const session = await createTestSession({
        narrative: customNarrative,
      });

      expect(session.narrative).toBe(customNarrative);
    });
  });

  describe('Helper Integration', () => {
    it('should create appointment and then session', async () => {
      // Create appointment
      const appointment = await createTestAppointment({
        status: 'IN_PROGRESS',
      });

      expect(appointment.status).toBe('IN_PROGRESS');

      // Create session from appointment
      const session = await createTestSession({
        appointmentId: appointment.id,
      });

      expect(session.appointmentId).toBe(appointment.id);
      expect(session.patientId).toBe(appointment.patientId);
      expect(session.practitionerId).toBe(appointment.practitionerId);
      expect(session.status).toBe('COMPLETED');
    });
  });
});
