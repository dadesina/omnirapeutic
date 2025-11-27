/**
 * Treatment Plan Endpoint Tests
 *
 * Tests for Treatment Plan CRUD operations with RBAC
 * HIPAA Compliance: Validates access controls and audit logging
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createTestTreatmentPlan } from './helpers/treatmentPlan.helper';
import { createCompleteTestPatient } from './helpers/factories';
import { Role, TreatmentPlanStatus } from '@prisma/client';

let app: Application;

describe('Treatment Plan Endpoints', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/treatment-plans - Create Treatment Plan', () => {
    it('should create a treatment plan as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      const planData = {
        patientId: patient.id,
        title: 'ABA Treatment Plan - Functional Communication',
        description: 'Comprehensive plan for improving communication skills',
        startDate: new Date().toISOString(),
        reviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(planData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(planData.title);
      expect(response.body.status).toBe(TreatmentPlanStatus.DRAFT);
    });

    it('should create a treatment plan as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test123!@#', practitioner.organizationId!);

      const planData = {
        patientId: patient.id,
        title: 'Treatment Plan by Practitioner',
        description: 'Plan created by practitioner',
        startDate: new Date().toISOString(),
        reviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(planData)
        .expect(201);

      expect(response.body.title).toBe(planData.title);
    });

    it('should reject creation as PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);

      const planData = {
        patientId: 'patient-id',
        title: 'Test Plan',
        description: 'Description',
        startDate: new Date().toISOString(),
        reviewDate: new Date().toISOString(),
      };

      await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send(planData)
        .expect(403);
    });

    it('should reject creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const planData = {
        title: 'Test Plan',
        // Missing patientId, description, startDate, reviewDate
      };

      await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(planData)
        .expect(400);
    });

    it('should reject creation with invalid date', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      const planData = {
        patientId: patient.id,
        title: 'Test Plan',
        description: 'Description',
        startDate: 'invalid-date',
        reviewDate: new Date().toISOString(),
      };

      await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(planData)
        .expect(400);
    });
  });

  describe('GET /api/treatment-plans/:id - Get Treatment Plan', () => {
    it('should retrieve treatment plan as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const plan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .get(`/api/treatment-plans/${plan.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(plan.id);
      expect(response.body.title).toBe(plan.title);
    });

    it('should retrieve treatment plan as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const plan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .get(`/api/treatment-plans/${plan.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.id).toBe(plan.id);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const plan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/treatment-plans/${plan.id}`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });

    it('should return 404 for non-existent plan', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/treatment-plans/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /api/treatment-plans - List Treatment Plans', () => {
    it('should list all treatment plans with pagination', async () => {
      const admin = await createTestUser(Role.ADMIN);

      // Create 3 plans
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });

      const response = await request(app)
        .get('/api/treatment-plans?page=1&limit=2')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.treatmentPlans).toHaveLength(2);
      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
    });

    it('should filter by status', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.ACTIVE,
      });
      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.DRAFT,
      });

      const response = await request(app)
        .get(`/api/treatment-plans?status=${TreatmentPlanStatus.ACTIVE}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.treatmentPlans.every((p: any) => p.status === TreatmentPlanStatus.ACTIVE)).toBe(true);
    });

    it('should reject PATIENT role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .get('/api/treatment-plans')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });
  });

  describe('PATCH /api/treatment-plans/:id - Update Treatment Plan', () => {
    it('should update treatment plan as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const plan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const updates = {
        title: 'Updated Title',
        description: 'Updated description',
      };

      const response = await request(app)
        .patch(`/api/treatment-plans/${plan.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
      expect(response.body.description).toBe('Updated description');
    });

    it('should reject update as PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const plan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .patch(`/api/treatment-plans/${plan.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({ title: 'Updated' })
        .expect(403);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const plan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .patch(`/api/treatment-plans/${plan.id}`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .send({ title: 'Updated' })
        .expect(403);
    });
  });

  describe('PATCH /api/treatment-plans/:id/status - Update Status', () => {
    it('should update status as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const plan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.DRAFT,
      });

      const response = await request(app)
        .patch(`/api/treatment-plans/${plan.id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ newStatus: TreatmentPlanStatus.ACTIVE })
        .expect(200);

      expect(response.body.status).toBe(TreatmentPlanStatus.ACTIVE);
    });

    it('should reject invalid status', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const plan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .patch(`/api/treatment-plans/${plan.id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ newStatus: 'INVALID_STATUS' })
        .expect(400);
    });
  });

  describe('GET /api/patients/:patientId/treatment-plans - Get by Patient', () => {
    it('should retrieve treatment plans for a patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });
      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const response = await request(app)
        .get(`/api/patients/${patient.id}/treatment-plans`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.every((p: any) => p.patientId === patient.id)).toBe(true);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin2.organizationId!);

      await request(app)
        .get(`/api/patients/${patient.id}/treatment-plans`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });
});
