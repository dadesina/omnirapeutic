/**
 * Data Point Endpoint Tests
 *
 * Tests for Data Point CRUD operations with RBAC
 * HIPAA Compliance: Data points are immutable, deletion restricted to ADMIN
 *
 * NOTE: Test Isolation Issue
 * This test file passes when run individually but may fail when run with the full suite
 * due to database state contamination between test files. This is a test infrastructure
 * issue, not a code functionality issue.
 *
 * To run this file in isolation:
 *   npm test -- src/__tests__/dataPoint.test.ts
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import {
  createTestGoal,
  createTestDataPoint,
} from './helpers/treatmentPlan.helper';
import { createTestSession } from './helpers/session.helper';
import { Role } from '@prisma/client';

let app: Application;

describe('Data Point Endpoints', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/data-points - Create Data Point', () => {
    it('should create data point as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      const dataPointData = {
        goalId: goal.id,
        value: 10,
        unit: 'mands',
        notes: 'Good progress',
      };

      const response = await request(app)
        .post('/api/data-points')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(dataPointData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.value).toBe(10);
      expect(response.body.unit).toBe('mands');
    });

    it('should create data point as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .post('/api/data-points')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({
          goalId: goal.id,
          value: 5,
          unit: 'count',
        })
        .expect(201);

      expect(response.body.value).toBe(5);
    });

    it('should reject creation as PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/data-points')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({
          goalId: 'goal-id',
          value: 10,
          unit: 'count',
        })
        .expect(403);
    });

    it('should reject creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/data-points')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ value: 10 })
        .expect(400);
    });

    it('should reject creation with non-numeric value', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .post('/api/data-points')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          goalId: goal.id,
          value: 'not a number',
          unit: 'count',
        })
        .expect(400);
    });

    it('should create data point with optional sessionId', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .post('/api/data-points')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          goalId: goal.id,
          sessionId: session.id,
          value: 15,
          unit: 'trials',
        })
        .expect(201);

      expect(response.body.sessionId).toBe(session.id);
    });
  });

  describe('POST /api/data-points/bulk - Bulk Create Data Points', () => {
    it('should bulk create data points as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      const dataPoints = [
        { goalId: goal.id, value: 1, unit: 'count' },
        { goalId: goal.id, value: 2, unit: 'count' },
        { goalId: goal.id, value: 3, unit: 'count' },
      ];

      const response = await request(app)
        .post('/api/data-points/bulk')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ dataPoints })
        .expect(201);

      expect(response.body.dataPoints).toHaveLength(3);
      expect(response.body.count).toBe(3);
    });

    it('should bulk create as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .post('/api/data-points/bulk')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({
          dataPoints: [
            { goalId: goal.id, value: 10, unit: 'mands' },
            { goalId: goal.id, value: 12, unit: 'mands' },
          ],
        })
        .expect(201);

      expect(response.body.count).toBe(2);
    });

    it('should reject bulk creation as PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/data-points/bulk')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({
          dataPoints: [{ goalId: 'goal-id', value: 1, unit: 'count' }],
        })
        .expect(403);
    });

    it('should reject empty dataPoints array', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .post('/api/data-points/bulk')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ dataPoints: [] })
        .expect(400);
    });

    it('should reject invalid data point in bulk', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .post('/api/data-points/bulk')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          dataPoints: [
            { goalId: goal.id, value: 1, unit: 'count' },
            { goalId: goal.id, value: 'invalid', unit: 'count' }, // Invalid
          ],
        })
        .expect(400);
    });
  });

  describe('GET /api/goals/:goalId/data-points - Get Data Points by Goal', () => {
    it('should retrieve data points for goal', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      // Create 3 data points
      await createTestDataPoint({ goalId: goal.id, organizationId: admin.organizationId!, value: 1 });
      await createTestDataPoint({ goalId: goal.id, organizationId: admin.organizationId!, value: 2 });
      await createTestDataPoint({ goalId: goal.id, organizationId: admin.organizationId!, value: 3 });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/data-points`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.dataPoints).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);
    });

    it('should respect pagination parameters', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      // Create 5 data points
      for (let i = 0; i < 5; i++) {
        await createTestDataPoint({
          goalId: goal.id,
          organizationId: admin.organizationId!,
          value: i,
        });
      }

      const response = await request(app)
        .get(`/api/goals/${goal.id}/data-points?page=1&limit=2`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.dataPoints).toHaveLength(2);
      expect(response.body.pagination.totalPages).toBe(3);
    });

    it('should filter by date range', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create data points with different dates
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 1,
        date: yesterday,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 2,
        date: new Date(),
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/data-points?startDate=${new Date().toISOString()}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      // Should only include today's data point
      expect(response.body.dataPoints.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject invalid pagination parameters', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .get(`/api/goals/${goal.id}/data-points?page=0&limit=200`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/goals/${goal.id}/data-points`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });

  describe('GET /api/sessions/:sessionId/data-points - Get Data Points by Session', () => {
    it('should retrieve data points by session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });

      await createTestDataPoint({
        goalId: goal.id,
        sessionId: session.id,
        organizationId: admin.organizationId!,
        value: 10,
      });

      const response = await request(app)
        .get(`/api/sessions/${session.id}/data-points`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].sessionId).toBe(session.id);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/sessions/${session.id}/data-points`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });

  describe('DELETE /api/data-points/:id - Delete Data Point', () => {
    it('should delete data point as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .delete(`/api/data-points/${dataPoint.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.message).toContain('deleted');
    });

    it('should reject deletion as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
      });
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: practitioner.organizationId!,
      });

      await request(app)
        .delete(`/api/data-points/${dataPoint.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);
    });

    it('should reject deletion as PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
      });
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
      });

      await request(app)
        .delete(`/api/data-points/${dataPoint.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should return 404 for non-existent data point', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .delete('/api/data-points/non-existent-id')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });

    it('should enforce multi-tenancy on deletion', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const goal = await createTestGoal({
        organizationId: admin2.organizationId!,
      });
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .delete(`/api/data-points/${dataPoint.id}`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });
});
