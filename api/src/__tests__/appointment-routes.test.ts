/**
 * Appointment Routes Integration Tests
 *
 * Tests REST API endpoints for appointment management
 */

import request from 'supertest';
import { Application } from 'express';
import { Role, AppointmentStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import {
  createTestAppointment,
  createTestAuthorization,
  createTestServiceCode,
  testDate,
} from './helpers/appointment.helper';

let app: Application;

describe('Appointment Routes', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/appointments', () => {
    it('should create appointment and return 201', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          patientId: patient.id,
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
          startTime: testDate.now.toISOString(),
          endTime: testDate.oneHourLater.toISOString(),
          notes: 'Test appointment',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.status).toBe(AppointmentStatus.SCHEDULED);
      expect(response.body.patientId).toBe(patient.id);
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/appointments')
        .send({})
        .expect(401);
    });

    it('should return 403 for patient role', async () => {
      const patient = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({})
        .expect(403);
    });

    it('should return 400 for validation errors', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          // Missing required fields
          notes: 'Invalid',
        })
        .expect(400);
    });

    it('should return 404 for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);

      await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          patientId: 'non-existent-id',
          practitionerId: practitioner.id,
          serviceCodeId: serviceCode.id,
          authorizationId: 'some-auth-id',
          startTime: testDate.now.toISOString(),
          endTime: testDate.oneHourLater.toISOString(),
        })
        .expect(404);
    });
  });

  describe('GET /api/appointments', () => {
    it('should return paginated appointments with 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createTestAppointment({ organizationId: admin.organizationId! });
      await createTestAppointment({ organizationId: admin.organizationId! });

      const response = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.appointments).toBeDefined();
      expect(Array.isArray(response.body.appointments)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination query params', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createTestAppointment({ organizationId: admin.organizationId! });
      await createTestAppointment({ organizationId: admin.organizationId! });
      await createTestAppointment({ organizationId: admin.organizationId! });

      const response = await request(app)
        .get('/api/appointments?page=1&limit=2')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.appointments).toHaveLength(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
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

      const response = await request(app)
        .get('/api/appointments?status=SCHEDULED')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.appointments.every((a: any) => a.status === 'SCHEDULED')).toBe(true);
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

      const response = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(200);

      expect(response.body.appointments).toHaveLength(1);
      expect(response.body.appointments[0].patientId).toBe(patient.id);
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('should return appointment with 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const response = await request(app)
        .get(`/api/appointments/${appointment.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(appointment.id);
      expect(response.body.status).toBeDefined();
    });

    it('should return 401 without token', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      await request(app)
        .get(`/api/appointments/${appointment.id}`)
        .expect(401);
    });

    it('should return 403 for wrong patient', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const appointment = await createTestAppointment({ organizationId: patientUser.organizationId! });

      await request(app)
        .get(`/api/appointments/${appointment.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should return 404 for non-existent appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/appointments/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('PUT /api/appointments/:id', () => {
    it('should update appointment and return 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const response = await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          notes: 'Updated notes',
        })
        .expect(200);

      expect(response.body.notes).toBe('Updated notes');
    });

    it('should return 403 for patient role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({ notes: 'Update' })
        .expect(403);
    });

    it('should return 400 for invalid date validation', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      await request(app)
        .put(`/api/appointments/${appointment.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          startTime: testDate.oneHourLater.toISOString(),
          endTime: testDate.now.toISOString(), // End before start
        })
        .expect(400);
    });

    it('should return 404 for non-existent appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .put('/api/appointments/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ notes: 'Update' })
        .expect(404);
    });
  });

  describe('POST /api/appointments/:id/cancel', () => {
    it('should cancel appointment and return 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const response = await request(app)
        .post(`/api/appointments/${appointment.id}/cancel`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('should return 403 for patient role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      await request(app)
        .post(`/api/appointments/${appointment.id}/cancel`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should return 400 for already cancelled appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.CANCELLED,
      });

      await request(app)
        .post(`/api/appointments/${appointment.id}/cancel`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });

    it('should return 404 for non-existent appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/appointments/non-existent-id/cancel')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('POST /api/appointments/:id/start', () => {
    it('should start appointment and return 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      const response = await request(app)
        .post(`/api/appointments/${appointment.id}/start`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('should return 403 for patient role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({ organizationId: admin.organizationId! });

      await request(app)
        .post(`/api/appointments/${appointment.id}/start`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should return 400 for already completed appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.COMPLETED,
      });

      await request(app)
        .post(`/api/appointments/${appointment.id}/start`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });

    it('should return 404 for non-existent appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/appointments/non-existent-id/start')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });
});
