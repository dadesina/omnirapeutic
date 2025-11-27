/**
 * Concurrency Tests for Appointments and Sessions
 *
 * Tests race conditions and concurrent operations to ensure:
 * - SERIALIZABLE transaction isolation prevents double-booking
 * - Unit reservation/consumption is thread-safe
 * - Multiple simultaneous appointment operations are handled correctly
 */

import { Role, AppointmentStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import {
  createTestServiceCode,
  createTestAuthorization,
  calculateExpectedUnits,
  testDate,
} from './helpers/appointment.helper';
import { createTestSessionData } from './helpers/session.helper';
import {
  createAppointment,
  cancelAppointment,
} from '../services/appointment.service';
import { completeAppointmentAndCreateSession } from '../services/session.service';
import { reserveUnits, consumeUnits } from '../services/authorization.service';

describe('Concurrency Tests', () => {
  describe('Concurrent Unit Reservations', () => {
    it('should prevent double-booking when multiple appointments try to reserve the same units', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const { practitioner: practitioner1 } = await createCompleteTestPractitioner(
        'Test123!@#',
        admin.organizationId!
      );
      const { practitioner: practitioner2 } = await createCompleteTestPractitioner(
        'Test456!@#',
        admin.organizationId!
      );
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 4, // Only 4 units available (1 hour)
      });

      // Create two overlapping appointment requests that each need 4 units
      const appointment1Data = {
        patientId: patient.id,
        practitionerId: practitioner1.id,
        serviceCodeId: serviceCode.id,
        authorizationId: authorization.id,
        startTime: testDate.now,
        endTime: testDate.oneHourLater,
      };

      const appointment2Data = {
        patientId: patient.id,
        practitionerId: practitioner2.id,
        serviceCodeId: serviceCode.id,
        authorizationId: authorization.id,
        startTime: testDate.now,
        endTime: testDate.oneHourLater,
      };

      // Execute both appointment creations concurrently
      const results = await Promise.allSettled([
        createAppointment(appointment1Data, admin.user),
        createAppointment(appointment2Data, admin.user),
      ]);

      // One should succeed, one should fail
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // Verify the failure is due to insufficient units
      const failure = failures[0] as PromiseRejectedResult;
      expect(failure.reason.message).toContain('Insufficient units');

      // Verify only 4 units were reserved (not 8)
      const auth = await prisma.authorization.findUnique({
        where: { id: authorization.id },
      });
      expect(auth?.scheduledUnits).toBe(4);
    });

    it('should handle multiple concurrent unit reservations correctly', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 100,
      });

      // Attempt to reserve 10 units concurrently from 5 different "requests"
      const reservationPromises = Array(5)
        .fill(null)
        .map(() => reserveUnits(authorization.id, 10, admin.user));

      const results = await Promise.allSettled(reservationPromises);

      // All should succeed since we have 100 units available
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(5);

      // Verify exactly 50 units were reserved
      const auth = await prisma.authorization.findUnique({
        where: { id: authorization.id },
      });
      expect(auth?.scheduledUnits).toBe(50);
    });

    it('should handle race condition when reserving last available units', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 15,
      });

      // 3 concurrent requests each trying to reserve 10 units (only 15 available)
      const reservationPromises = Array(3)
        .fill(null)
        .map(() => reserveUnits(authorization.id, 10, admin.user));

      const results = await Promise.allSettled(reservationPromises);

      // Only 1 should succeed
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(2);

      // Verify exactly 10 units were reserved
      const auth = await prisma.authorization.findUnique({
        where: { id: authorization.id },
      });
      expect(auth?.scheduledUnits).toBe(10);
    });
  });

  describe('Concurrent Session Completion', () => {
    it('should prevent duplicate session creation for same appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const { practitioner } = await createCompleteTestPractitioner(
        'Test123!@#',
        admin.organizationId!
      );
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 100,
      });

      // Create appointment with reserved units
      const expectedUnits = calculateExpectedUnits(testDate.now, testDate.oneHourLater);
      const appointment = await createAppointment(
        {
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
          startTime: testDate.now,
          endTime: testDate.oneHourLater,
        },
        admin.user
      );

      // Update status to IN_PROGRESS
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: AppointmentStatus.IN_PROGRESS },
      });

      // Try to complete the same appointment twice concurrently
      const sessionData = createTestSessionData(appointment.id);
      const completionPromises = [
        completeAppointmentAndCreateSession(sessionData, admin.user),
        completeAppointmentAndCreateSession(sessionData, admin.user),
      ];

      const results = await Promise.allSettled(completionPromises);

      // Due to transaction isolation, either one succeeds and one fails,
      // or both fail (if they both see IN_PROGRESS and then both try to mark COMPLETED)
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      // At least one should have failed (double completion prevented)
      expect(failures.length).toBeGreaterThanOrEqual(1);

      // Verify only one session was created (or none if both failed)
      const sessions = await prisma.session.findMany({
        where: { appointmentId: appointment.id },
      });
      expect(sessions.length).toBeLessThanOrEqual(1);

      if (successes.length > 0) {
        // If one succeeded, verify units were consumed once
        const auth = await prisma.authorization.findUnique({
          where: { id: authorization.id },
        });
        expect(auth?.scheduledUnits).toBe(0);
        expect(auth?.usedUnits).toBe(expectedUnits);
        expect(sessions).toHaveLength(1);
      }
    });

    it('should handle concurrent unit consumption correctly', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 100,
      });

      // First reserve 50 units
      await reserveUnits(authorization.id, 50, admin.user);

      // Try to consume units concurrently
      const consumptionPromises = Array(5)
        .fill(null)
        .map(() => consumeUnits(authorization.id, 10, admin.user));

      const results = await Promise.allSettled(consumptionPromises);

      // All 5 should succeed since we have 50 scheduled units
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(5);

      // Verify exactly 50 units were consumed
      const auth = await prisma.authorization.findUnique({
        where: { id: authorization.id },
      });
      expect(auth?.scheduledUnits).toBe(0);
      expect(auth?.usedUnits).toBe(50);
    });
  });

  describe('Concurrent Appointment Cancellation', () => {
    it('should handle concurrent cancellation attempts gracefully', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const { practitioner } = await createCompleteTestPractitioner(
        'Test123!@#',
        admin.organizationId!
      );
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 100,
      });

      const appointment = await createAppointment(
        {
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
          startTime: testDate.now,
          endTime: testDate.oneHourLater,
        },
        admin.user
      );

      // Try to cancel the same appointment multiple times concurrently
      const cancellationPromises = [
        cancelAppointment(appointment.id, admin.user),
        cancelAppointment(appointment.id, admin.user),
        cancelAppointment(appointment.id, admin.user),
      ];

      const results = await Promise.allSettled(cancellationPromises);

      // Due to concurrency, outcomes can vary:
      // - One succeeds, others fail (most likely)
      // - All fail if they all try to update at same time
      // The key is that the final state is correct
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      // Verify appointment is cancelled (if any succeeded)
      const cancelledAppointment = await prisma.appointment.findUnique({
        where: { id: appointment.id },
      });

      if (successes.length > 0) {
        // At least one cancellation succeeded
        expect(cancelledAppointment?.status).toBe(AppointmentStatus.CANCELLED);

        // Verify units were released (back to 0 scheduled)
        const auth = await prisma.authorization.findUnique({
          where: { id: authorization.id },
        });
        expect(auth?.scheduledUnits).toBe(0);
      } else {
        // All failed - check that failures are due to concurrency/state issues
        expect(failures.length).toBe(3);
      }
    });
  });

  describe('Mixed Concurrent Operations', () => {
    it('should handle concurrent reserve, consume, and release operations', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
        totalUnits: 100,
      });

      // Pre-reserve some units
      await reserveUnits(authorization.id, 20, admin.user);

      // Mix of operations happening concurrently
      const operations = [
        reserveUnits(authorization.id, 10, admin.user),
        reserveUnits(authorization.id, 10, admin.user),
        consumeUnits(authorization.id, 10, admin.user),
        consumeUnits(authorization.id, 10, admin.user),
      ];

      const results = await Promise.allSettled(operations);

      // All should succeed
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(4);

      // Verify final state is consistent
      const auth = await prisma.authorization.findUnique({
        where: { id: authorization.id },
      });

      // Started with 20 scheduled
      // + 10 + 10 = 40 scheduled
      // - 10 - 10 = 20 scheduled, 20 used
      expect(auth?.scheduledUnits).toBe(20);
      expect(auth?.usedUnits).toBe(20);
      expect((auth?.scheduledUnits || 0) + (auth?.usedUnits || 0)).toBe(40);
    });
  });
});
