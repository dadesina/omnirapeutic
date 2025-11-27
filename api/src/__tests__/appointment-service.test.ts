/**
 * Appointment Service Tests
 *
 * Comprehensive tests for appointment service with focus on:
 * - Unit reservation/release operations
 * - RBAC enforcement
 * - Multi-tenancy boundaries
 * - Transaction atomicity
 */

import { Role, AppointmentStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import {
  createTestAppointment,
  createTestAuthorization,
  createTestServiceCode,
  createTestAppointmentData,
  calculateExpectedUnits,
  testDate,
  createMultipleAppointments,
} from './helpers/appointment.helper';
import {
  createAppointment,
  getAppointmentById,
  getAllAppointments,
  updateAppointment,
  cancelAppointment,
  startAppointment,
} from '../services/appointment.service';

describe('Appointment Service', () => {
  describe('createAppointment()', () => {
    describe('Happy Path', () => {
      it('should create appointment and reserve units', async () => {
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

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        const appointment = await createAppointment(appointmentData, admin.user);

        expect(appointment).toBeDefined();
        expect(appointment.id).toBeDefined();
        expect(appointment.status).toBe(AppointmentStatus.SCHEDULED);
        expect(appointment.patientId).toBe(patient.id);
        expect(appointment.practitionerId).toBe(practitioner.id);

        // Verify units were reserved
        const updatedAuth = await prisma.authorization.findUnique({
          where: { id: authorization.id },
        });
        const expectedUnits = calculateExpectedUnits(appointmentData.startTime, appointmentData.endTime);
        expect(updatedAuth?.scheduledUnits).toBe(expectedUnits);
        expect(updatedAuth?.usedUnits).toBe(0);
        expect(updatedAuth?.totalUnits).toBe(100);
      });
    });

    describe('RBAC Enforcement', () => {
      it('should allow admin to create appointment', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
        const serviceCode = await createTestServiceCode(admin.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: admin.organizationId!,
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        await expect(createAppointment(appointmentData, admin.user)).resolves.toBeDefined();
      });

      it('should allow practitioner to create appointment', async () => {
        const practitionerUser = await createTestUser(Role.PRACTITIONER);
        const { patient } = await createCompleteTestPatient('Test123!@#', practitionerUser.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', practitionerUser.organizationId!);
        const serviceCode = await createTestServiceCode(practitionerUser.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: practitionerUser.organizationId!,
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        await expect(createAppointment(appointmentData, practitionerUser.user)).resolves.toBeDefined();
      });

      it('should prevent patient from creating appointment', async () => {
        const patientUser = await createTestUser(Role.PATIENT);
        const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', patientUser.organizationId!);
        const serviceCode = await createTestServiceCode(patientUser.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: patientUser.organizationId!,
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        await expect(createAppointment(appointmentData, patientUser.user)).rejects.toThrow(
          'Forbidden: Only administrators and practitioners can create appointments'
        );
      });
    });

    describe('Validation', () => {
      it('should reject invalid dates (end before start)', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
        const serviceCode = await createTestServiceCode(admin.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: admin.organizationId!,
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
          startTime: testDate.oneHourLater,
          endTime: testDate.now, // End before start
        });

        await expect(createAppointment(appointmentData, admin.user)).rejects.toThrow(
          'End time must be after start time'
        );
      });

      it('should reject appointment with insufficient units', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
        const serviceCode = await createTestServiceCode(admin.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: admin.organizationId!,
          totalUnits: 2, // Only 2 units, but 1 hour = 4 units
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        await expect(createAppointment(appointmentData, admin.user)).rejects.toThrow('Insufficient units');
      });

      it('should reject appointment with wrong patient authorization', async () => {
        const admin = await createTestUser(Role.ADMIN);
        const { patient: patient1 } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
        const { patient: patient2 } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
        const serviceCode = await createTestServiceCode(admin.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient1.id,
          serviceCodeId: serviceCode.id,
          organizationId: admin.organizationId!,
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient2.id, // Different patient
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        await expect(createAppointment(appointmentData, admin.user)).rejects.toThrow(
          'Authorization does not belong to the specified patient'
        );
      });
    });

    describe('Multi-Tenancy', () => {
      it('should prevent cross-org appointment creation', async () => {
        const org1Admin = await createTestUser(Role.ADMIN);
        const org2Admin = await createTestUser(Role.ADMIN);

        const { patient } = await createCompleteTestPatient('Test123!@#', org1Admin.organizationId!);
        const { practitioner } = await createCompleteTestPractitioner('Test123!@#', org2Admin.organizationId!);
        const serviceCode = await createTestServiceCode(org1Admin.organizationId!);
        const authorization = await createTestAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          organizationId: org1Admin.organizationId!,
        });

        const appointmentData = await createTestAppointmentData({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
        });

        await expect(createAppointment(appointmentData, org1Admin.user)).rejects.toThrow(
          'Forbidden: Practitioner must be in your organization'
        );
      });
    });
  });

  describe('getAppointmentById()', () => {
    it('should allow admin to access appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const result = await getAppointmentById(appointment.id, admin.user);

      expect(result).toBeDefined();
      expect(result.id).toBe(appointment.id);
    });

    it('should allow practitioner to access appointment', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const appointment = await createTestAppointment({ organizationId: practitioner.organizationId! });

      const result = await getAppointmentById(appointment.id, practitioner.user);

      expect(result).toBeDefined();
      expect(result.id).toBe(appointment.id);
    });

    it('should allow patient to view own appointment', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);

      // Update patient to use patientUser
      await prisma.patient.update({
        where: { id: patient.id },
        data: { userId: patientUser.id },
      });

      const appointment = await createTestAppointment({
        organizationId: patientUser.organizationId!,
        patientId: patient.id,
      });

      const result = await getAppointmentById(appointment.id, patientUser.user);

      expect(result).toBeDefined();
      expect(result.id).toBe(appointment.id);
    });

    it('should prevent patient from viewing others appointments', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const appointment = await createTestAppointment({ organizationId: patientUser.organizationId! });

      await expect(getAppointmentById(appointment.id, patientUser.user)).rejects.toThrow('Forbidden');
    });

    it('should prevent cross-org access', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: org1Admin.organizationId! });

      await expect(getAppointmentById(appointment.id, org2Admin.user)).rejects.toThrow(
        'Forbidden: You can only access appointments in your organization'
      );
    });

    it('should throw error for not found appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(getAppointmentById('non-existent-id', admin.user)).rejects.toThrow('Appointment not found');
    });
  });

  describe('getAllAppointments()', () => {
    it('should return paginated appointments', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createMultipleAppointments(5, { organizationId: admin.organizationId! });

      const result = await getAllAppointments(admin.user, { page: 1, limit: 3 });

      expect(result.appointments).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });

    it('should filter by patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createMultipleAppointments(3, {
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });
      await createMultipleAppointments(2, { organizationId: admin.organizationId! });

      const result = await getAllAppointments(admin.user, { patientId: patient.id });

      expect(result.appointments).toHaveLength(3);
      expect(result.appointments.every((a) => a.patientId === patient.id)).toBe(true);
    });

    it('should filter by status', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.SCHEDULED,
      });
      await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.COMPLETED,
      });

      const result = await getAllAppointments(admin.user, { status: AppointmentStatus.SCHEDULED });

      expect(result.appointments).toHaveLength(1);
      expect(result.appointments[0].status).toBe(AppointmentStatus.SCHEDULED);
    });

    it('should only show patient their own appointments', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);

      await prisma.patient.update({
        where: { id: patient.id },
        data: { userId: patientUser.id },
      });

      await createTestAppointment({
        organizationId: patientUser.organizationId!,
        patientId: patient.id,
      });
      await createTestAppointment({ organizationId: patientUser.organizationId! });

      const result = await getAllAppointments(patientUser.user);

      expect(result.appointments).toHaveLength(1);
      expect(result.appointments[0].patientId).toBe(patient.id);
    });

    it('should scope to organization', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);

      await createMultipleAppointments(3, { organizationId: org1Admin.organizationId! });
      await createMultipleAppointments(2, { organizationId: org2Admin.organizationId! });

      const result = await getAllAppointments(org1Admin.user);

      expect(result.appointments).toHaveLength(3);
      expect(result.appointments.every((a) => a.organizationId === org1Admin.organizationId)).toBe(true);
    });
  });

  describe('updateAppointment()', () => {
    it('should allow admin to update appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const updated = await updateAppointment(
        appointment.id,
        { notes: 'Updated notes' },
        admin.user
      );

      expect(updated.notes).toBe('Updated notes');
    });

    it('should allow practitioner to update appointment', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const appointment = await createTestAppointment({ organizationId: practitioner.organizationId! });

      const updated = await updateAppointment(
        appointment.id,
        { notes: 'Practitioner update' },
        practitioner.user
      );

      expect(updated.notes).toBe('Practitioner update');
    });

    it('should prevent updating completed appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(
        updateAppointment(appointment.id, { notes: 'Update' }, admin.user)
      ).rejects.toThrow('Cannot update completed or cancelled appointments');
    });

    it('should prevent updating cancelled appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        updateAppointment(appointment.id, { notes: 'Update' }, admin.user)
      ).rejects.toThrow('Cannot update completed or cancelled appointments');
    });

    it('should validate dates', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      await expect(
        updateAppointment(
          appointment.id,
          {
            startTime: testDate.oneHourLater,
            endTime: testDate.now, // End before start
          },
          admin.user
        )
      ).rejects.toThrow('End time must be after start time');
    });

    it('should prevent cross-org update', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: org1Admin.organizationId! });

      await expect(
        updateAppointment(appointment.id, { notes: 'Update' }, org2Admin.user)
      ).rejects.toThrow('Forbidden: You can only update appointments in your organization');
    });
  });

  describe('cancelAppointment()', () => {
    it('should cancel appointment and release units', async () => {
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

      const appointmentData = await createTestAppointmentData({
        patientId: patient.id,
        practitionerId: practitioner.id,
        serviceCodeId: serviceCode.id,
        authorizationId: authorization.id,
      });

      const appointment = await createAppointment(appointmentData, admin.user);
      const expectedUnits = calculateExpectedUnits(appointmentData.startTime, appointmentData.endTime);

      // Verify units were reserved
      let auth = await prisma.authorization.findUnique({ where: { id: authorization.id } });
      expect(auth?.scheduledUnits).toBe(expectedUnits);

      // Cancel appointment
      const cancelled = await cancelAppointment(appointment.id, admin.user);

      expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);

      // Verify units were released
      auth = await prisma.authorization.findUnique({ where: { id: authorization.id } });
      expect(auth?.scheduledUnits).toBe(0);
    });

    it('should prevent cancelling completed appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(cancelAppointment(appointment.id, admin.user)).rejects.toThrow(
        'Cannot cancel completed appointment'
      );
    });

    it('should prevent cancelling already cancelled appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(cancelAppointment(appointment.id, admin.user)).rejects.toThrow(
        'Appointment is already cancelled'
      );
    });

    it('should prevent cross-org cancellation', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: org1Admin.organizationId! });

      await expect(cancelAppointment(appointment.id, org2Admin.user)).rejects.toThrow(
        'Forbidden: You can only cancel appointments in your organization'
      );
    });
  });

  describe('startAppointment()', () => {
    it('should change status to IN_PROGRESS', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const started = await startAppointment(appointment.id, admin.user);

      expect(started.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('should only start SCHEDULED appointments', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(startAppointment(appointment.id, admin.user)).rejects.toThrow(
        'Can only start scheduled appointments'
      );
    });

    it('should prevent cross-org start', async () => {
      const org1Admin = await createTestUser(Role.ADMIN);
      const org2Admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: org1Admin.organizationId! });

      await expect(startAppointment(appointment.id, org2Admin.user)).rejects.toThrow(
        'Forbidden: You can only start appointments in your organization'
      );
    });
  });
});
