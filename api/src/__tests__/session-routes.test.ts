/**
 * Session Routes Integration Tests
 *
 * Tests REST API endpoints for session management
 */

import request from 'supertest';
import { Application } from 'express';
import { Role, AppointmentStatus, SessionStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import { createTestAppointment } from './helpers/appointment.helper';
import { createTestSession, createMultipleSessions } from './helpers/session.helper';

let app: Application;

describe('Session Routes', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/sessions', () => {
    it('should complete appointment and create session with 201', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          appointmentId: appointment.id,
          narrative: 'Test session narrative',
          latestMetrics: {
            behavior: 'appropriate',
            engagement: 'high',
          },
        })
        .expect(201);

      expect(response.body.session).toBeDefined();
      expect(response.body.session.id).toBeDefined();
      expect(response.body.session.appointmentId).toBe(appointment.id);
      expect(response.body.session.status).toBe(SessionStatus.COMPLETED);
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/sessions')
        .send({})
        .expect(401);
    });

    it('should return 403 for patient role', async () => {
      const patient = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({})
        .expect(403);
    });

    it('should return 400 for validation errors', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          // Missing appointmentId
          narrative: 'Test',
        })
        .expect(400);
    });

    it('should return 404 for non-existent appointment', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          appointmentId: 'non-existent-id',
          narrative: 'Test',
        })
        .expect(404);
    });
  });

  describe('GET /api/sessions', () => {
    it('should return paginated sessions with 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createTestSession({ organizationId: admin.organizationId! });
      await createTestSession({ organizationId: admin.organizationId! });

      const response = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination query params', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createMultipleSessions(3, { organizationId: admin.organizationId! });

      const response = await request(app)
        .get('/api/sessions?page=1&limit=2')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
    });

    it('should filter by status', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createMultipleSessions(2, {
        organizationId: admin.organizationId!,
        status: SessionStatus.COMPLETED,
      });

      const response = await request(app)
        .get('/api/sessions?status=COMPLETED')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.sessions.every((s: any) => s.status === 'COMPLETED')).toBe(true);
    });

    it('should only show patient their own sessions', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);

      await prisma.patient.update({
        where: { id: patient.id },
        data: { userId: patientUser.id },
      });

      await createTestSession({
        organizationId: patientUser.organizationId!,
        patientId: patient.id,
      });
      await createTestSession({ organizationId: patientUser.organizationId! });

      const response = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(200);

      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0].patientId).toBe(patient.id);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return session with 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({ organizationId: admin.organizationId! });

      const response = await request(app)
        .get(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(session.id);
      expect(response.body.status).toBeDefined();
    });

    it('should return 401 without token', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({ organizationId: admin.organizationId! });

      await request(app)
        .get(`/api/sessions/${session.id}`)
        .expect(401);
    });

    it('should return 403 for wrong patient', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const session = await createTestSession({ organizationId: patientUser.organizationId! });

      await request(app)
        .get(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should return 404 for non-existent session', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/sessions/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /api/sessions/patient/:patientId', () => {
    it('should return patient sessions with 200', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createTestSession({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const response = await request(app)
        .get(`/api/sessions/patient/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((s: any) => s.patientId === patient.id)).toBe(true);
    });

    it('should return 401 without token', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await request(app)
        .get(`/api/sessions/patient/${patient.id}`)
        .expect(401);
    });

    it('should return 404 for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/sessions/patient/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /api/sessions/practitioner/:practitionerId', () => {
    it('should return practitioner sessions with 200 for admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);

      await createTestSession({
        organizationId: admin.organizationId!,
        practitionerId: practitioner.id,
      });

      const response = await request(app)
        .get(`/api/sessions/practitioner/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((s: any) => s.practitionerId === practitioner.id)).toBe(true);
    });

    it('should return 401 without token', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', admin.organizationId!);

      await request(app)
        .get(`/api/sessions/practitioner/${practitioner.id}`)
        .expect(401);
    });

    it('should return 403 for non-admin role', async () => {
      const practitionerUser = await createTestUser(Role.PRACTITIONER);
      const { practitioner } = await createCompleteTestPractitioner('Test123!@#', practitionerUser.organizationId!);

      await request(app)
        .get(`/api/sessions/practitioner/${practitioner.id}`)
        .set('Authorization', `Bearer ${practitionerUser.token}`)
        .expect(403);
    });

    it('should return 404 for non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/sessions/practitioner/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });
});
