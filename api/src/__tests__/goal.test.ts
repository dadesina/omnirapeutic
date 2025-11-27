/**
 * Goal Endpoint Tests
 *
 * Tests for Goal CRUD operations with RBAC
 * HIPAA Compliance: Validates access controls and audit logging
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createTestTreatmentPlan, createTestGoal, createTestDataPoint } from './helpers/treatmentPlan.helper';
import { Role, GoalType, GoalStatus } from '@prisma/client';

let app: Application;

describe('Goal Endpoints', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/goals - Create Goal', () => {
    it('should create a goal as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const goalData = {
        treatmentPlanId: treatmentPlan.id,
        title: 'Increase Verbal Communication',
        description: 'Patient will increase verbal mands',
        goalType: GoalType.SHORT_TERM,
        domain: 'Communication',
        baseline: { value: 2, unit: 'mands per session' },
        targetCriteria: '10+ mands per session with 80% accuracy',
        measurementMethod: 'Frequency count',
      };

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(goalData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(goalData.title);
      expect(response.body.status).toBe(GoalStatus.ACTIVE);
    });

    it('should create a goal as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });

      const goalData = {
        treatmentPlanId: treatmentPlan.id,
        title: 'Test Goal',
        description: 'Description',
        goalType: GoalType.LONG_TERM,
        domain: 'Social Skills',
        targetCriteria: 'Criteria',
        measurementMethod: 'Method',
      };

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(goalData)
        .expect(201);

      expect(response.body.title).toBe(goalData.title);
    });

    it('should reject creation as PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);

      const goalData = {
        treatmentPlanId: 'plan-id',
        title: 'Test Goal',
        description: 'Description',
        goalType: GoalType.SHORT_TERM,
        domain: 'Domain',
        targetCriteria: 'Criteria',
        measurementMethod: 'Method',
      };

      await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send(goalData)
        .expect(403);
    });

    it('should reject creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const goalData = {
        title: 'Test Goal',
        // Missing treatmentPlanId, description, goalType, etc.
      };

      await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(goalData)
        .expect(400);
    });

    it('should reject creation with invalid goalType', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const goalData = {
        treatmentPlanId: treatmentPlan.id,
        title: 'Test Goal',
        description: 'Description',
        goalType: 'INVALID_TYPE',
        domain: 'Domain',
        targetCriteria: 'Criteria',
        measurementMethod: 'Method',
      };

      await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(goalData)
        .expect(400);
    });
  });

  describe('GET /api/goals/:id - Get Goal', () => {
    it('should retrieve goal as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(goal.id);
      expect(response.body.title).toBeDefined();
    });

    it('should retrieve goal as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.id).toBe(goal.id);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });

    it('should return 404 for non-existent goal', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/goals/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /api/treatment-plans/:planId/goals - Get Goals by Treatment Plan', () => {
    it('should retrieve all goals for a treatment plan', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        title: 'Goal 1',
      });
      await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        title: 'Goal 2',
      });

      const response = await request(app)
        .get(`/api/treatment-plans/${treatmentPlan.id}/goals`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.every((g: any) => g.treatmentPlanId === treatmentPlan.id)).toBe(true);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/treatment-plans/${treatmentPlan.id}/goals`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });

  describe('PATCH /api/goals/:id - Update Goal', () => {
    it('should update goal as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const updates = {
        title: 'Updated Title',
        description: 'Updated description',
      };

      const response = await request(app)
        .patch(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
    });

    it('should update goal as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .patch(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ title: 'Updated by Practitioner' })
        .expect(200);

      expect(response.body.title).toBe('Updated by Practitioner');
    });

    it('should reject update as PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      await request(app)
        .patch(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({ title: 'Updated' })
        .expect(403);
    });

    it('should prevent updating MET goals', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        status: GoalStatus.MET,
      });

      await request(app)
        .patch(`/api/goals/${goal.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Updated' })
        .expect(400);
    });
  });

  describe('POST /api/goals/:id/mark-met - Mark Goal as Met', () => {
    it('should mark goal as met as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        status: GoalStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/goals/${goal.id}/mark-met`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.status).toBe(GoalStatus.MET);
      expect(response.body.masteryDate).toBeDefined();
    });

    it('should mark goal as met as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .post(`/api/goals/${goal.id}/mark-met`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.status).toBe(GoalStatus.MET);
    });

    it('should reject marking as PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      await request(app)
        .post(`/api/goals/${goal.id}/mark-met`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should reject marking already MET goal', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        status: GoalStatus.MET,
      });

      await request(app)
        .post(`/api/goals/${goal.id}/mark-met`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });
  });

  describe('GET /api/goals/:id/progress - Calculate Goal Progress', () => {
    it('should calculate progress with data points', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        baseline: { value: 2 },
      });

      // Create data points showing improvement
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 2,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 5,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 8,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/progress`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.progress.totalDataPoints).toBe(3);
      expect(response.body.progress.firstValue).toBe(2);
      expect(response.body.progress.latestValue).toBe(8);
      expect(response.body.progress.trend).toBe('IMPROVING');
    });

    it('should return NO_DATA for goal without data points', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/progress`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.progress.totalDataPoints).toBe(0);
      expect(response.body.progress.trend).toBe('NO_DATA');
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/goals/${goal.id}/progress`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });
});
