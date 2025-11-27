/**
 * Authorization Endpoint Tests
 *
 * Tests for Authorization CRUD and unit management with RBAC, organization scoping,
 * and audit logging. This is a critical API for preventing overbilling.
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient } from './helpers/factories';
import { Role, AuthStatus, ServiceCode } from '@prisma/client';

let app: Application;

/**
 * Helper to create a service code for tests.
 * @param organizationId The organization ID.
 * @returns The created ServiceCode.
 */
const createTestServiceCode = async (organizationId: string): Promise<ServiceCode> => {
  return prisma.serviceCode.create({
    data: {
      code: `97153-${Math.random()}`, // Avoid collisions between tests
      description: 'Adaptive behavior treatment',
      category: 'TREATMENT',
      requiredCredentials: [],
      typicalDuration: 60,
      organizationId: organizationId,
    },
  });
};

describe('Authorization Endpoints', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/authorizations - Create Authorization', () => {
    it('should create a new authorization as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);

      const authData = {
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-123',
        totalUnits: 100,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T00:00:00.000Z',
      };

      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(authData)
        .expect(201);

      expect(response.body.patientId).toBe(patient.id);
      expect(response.body.serviceCodeId).toBe(serviceCode.id);
      expect(response.body.totalUnits).toBe(100);
      expect(response.body.status).toBe(AuthStatus.ACTIVE);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          action: 'CREATE_AUTHORIZATION',
          resourceId: response.body.id,
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject creation as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      const serviceCode = await createTestServiceCode(practitioner.organizationId!);

      const authData = {
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        totalUnits: 50,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T00:00:00.000Z',
      };

      await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(authData)
        .expect(403);
    });

    it('should reject creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);

      const authData = { patientId: patient.id, serviceCodeId: serviceCode.id }; // Missing totalUnits, dates

      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(authData)
        .expect(400);

      expect(response.body.message).toContain('required');
    });

    it('should reject ADMIN creating auth for patient in another organization', async () => {
      const adminOrg1 = await createTestUser(Role.ADMIN);
      const { patient: patientOrg2 } = await createCompleteTestPatient('Test1234!'); // Creates its own org

      const serviceCode = await createTestServiceCode(adminOrg1.organizationId!);

      const authData = {
        patientId: patientOrg2.id,
        serviceCodeId: serviceCode.id,
        totalUnits: 100,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T00:00:00.000Z',
      };

      await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${adminOrg1.token}`)
        .send(authData)
        .expect(403);
    });
  });

  describe('GET /api/authorizations - List Authorizations', () => {
    it('should list authorizations for an ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const response = await request(app)
        .get('/api/authorizations')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('authorizations');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should list authorizations for a PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const response = await request(app)
        .get('/api/authorizations')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('authorizations');
    });

    it('should reject listing for a PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      await request(app)
        .get('/api/authorizations')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });
  });

  describe('GET /api/authorizations/:id - Get Authorization by ID', () => {
    it('should get an authorization by ID as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const auth = await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 10,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      });

      const response = await request(app)
        .get(`/api/authorizations/${auth.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(auth.id);
    });

    it('should return 404 for a non-existent authorization ID', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await request(app)
        .get('/api/authorizations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /api/authorizations/patients/:patientId/authorizations', () => {
    it('should get all authorizations for a patient as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 10,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      });

      const response = await request(app)
        .get(`/api/authorizations/patients/${patient.id}/authorizations`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].patientId).toBe(patient.id);
    });
  });

  describe('PUT /api/authorizations/:id - Update Authorization', () => {
    it('should update an authorization as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const auth = await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 10,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          notes: 'Original note',
        },
      });

      const updates = { notes: 'Updated note text' };

      const response = await request(app)
        .put(`/api/authorizations/${auth.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.notes).toBe('Updated note text');

      const auditLog = await prisma.auditLog.findFirst({
        where: { userId: admin.id, action: 'UPDATE_AUTHORIZATION', resourceId: auth.id },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject update as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      const serviceCode = await createTestServiceCode(practitioner.organizationId!);
      const auth = await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: practitioner.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 10,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      });

      await request(app)
        .put(`/api/authorizations/${auth.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ notes: 'New Note' })
        .expect(403);
    });
  });

  describe('DELETE /api/authorizations/:id - Delete Authorization', () => {
    it('should delete an authorization as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const auth = await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 10,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      });

      await request(app)
        .delete(`/api/authorizations/${auth.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);

      const found = await prisma.authorization.findUnique({ where: { id: auth.id } });
      expect(found).toBeNull();
      const auditLog = await prisma.auditLog.findFirst({
        where: { userId: admin.id, action: 'DELETE_AUTHORIZATION', resourceId: auth.id },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  describe('Unit Management Operations', () => {
    let practitioner: any, auth: any;

    beforeEach(async () => {
      practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      const serviceCode = await createTestServiceCode(practitioner.organizationId!);
      auth = await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: practitioner.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 20,
          usedUnits: 5,
          scheduledUnits: 5,
          status: AuthStatus.ACTIVE,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      });
    });

    it('GET /:id/available-units - should return available units', async () => {
      const response = await request(app)
        .get(`/api/authorizations/${auth.id}/available-units`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      // total (20) - used (5) - scheduled (5) = 10
      expect(response.body.availableUnits).toBe(10);
      expect(response.body.totalUnits).toBe(20);
    });

    it('POST /:id/reserve - should reserve units as PRACTITIONER', async () => {
      const response = await request(app)
        .post(`/api/authorizations/${auth.id}/reserve`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 5 })
        .expect(200);

      expect(response.body.scheduledUnits).toBe(10); // 5 initial + 5 new
    });

    it('POST /:id/reserve - should reject reserving more units than available', async () => {
      await request(app)
        .post(`/api/authorizations/${auth.id}/reserve`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 11 }) // Only 10 are available
        .expect(400);
    });

    it('POST /:id/release - should release units', async () => {
      const response = await request(app)
        .post(`/api/authorizations/${auth.id}/release`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 3 })
        .expect(200);

      expect(response.body.scheduledUnits).toBe(2); // 5 initial - 3 released
    });

    it('POST /:id/release - should reject releasing more units than scheduled', async () => {
      await request(app)
        .post(`/api/authorizations/${auth.id}/release`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 6 }) // Only 5 are scheduled
        .expect(400);
    });

    it('POST /:id/consume - should consume units and move from scheduled to used', async () => {
      const response = await request(app)
        .post(`/api/authorizations/${auth.id}/consume`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 4 })
        .expect(200);

      expect(response.body.scheduledUnits).toBe(1); // 5 -> 1
      expect(response.body.usedUnits).toBe(9); // 5 -> 9
    });

    it('POST /:id/consume - should transition status to EXHAUSTED', async () => {
      // Consume the remaining 15 units (5 used + 5 scheduled + 10 available)
      await request(app)
        .post(`/api/authorizations/${auth.id}/consume`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 5 }) // Consume all scheduled
        .expect(200);

      // Reserve and consume the rest
      await request(app)
        .post(`/api/authorizations/${auth.id}/reserve`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 10 });

      const response = await request(app)
        .post(`/api/authorizations/${auth.id}/consume`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ units: 10 })
        .expect(200);

      expect(response.body.usedUnits).toBe(20);
      expect(response.body.status).toBe(AuthStatus.EXHAUSTED);
    });
  });

  describe('GET /api/authorizations/active/:patientId/:serviceCodeId', () => {
    it('should get active authorization for a patient and service', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      await prisma.authorization.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          serviceCodeId: serviceCode.id,
          totalUnits: 10,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: AuthStatus.ACTIVE,
        },
      });

      const response = await request(app)
        .get(`/api/authorizations/active/${patient.id}/${serviceCode.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.patientId).toBe(patient.id);
      expect(response.body.serviceCodeId).toBe(serviceCode.id);
      expect(response.body.status).toBe(AuthStatus.ACTIVE);
    });

    it('should return 404 if no active authorization is found', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);

      await request(app)
        .get(`/api/authorizations/active/${patient.id}/${serviceCode.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });
});
