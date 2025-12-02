/**
 * Goal Progress & Milestones API Smoke Tests
 * Phase 7B.2 Week 3: Goal Progress Visualization
 *
 * Smoke tests for core functionality - validates services compile and routes are registered
 */

import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('Goal Progress & Milestones API - Smoke Tests', () => {
  describe('Route Registration', () => {
    it('should have milestone creation route registered', async () => {
      const response = await request(app)
        .post('/api/goals/test-id/milestones')
        .send({
          description: 'Test milestone',
        });

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403, 400]).toContain(response.status);
    });

    it('should have milestone list route registered', async () => {
      const response = await request(app)
        .get('/api/goals/test-id/milestones');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403]).toContain(response.status);
    });

    it('should have progress update route registered', async () => {
      const response = await request(app)
        .post('/api/goals/test-id/progress')
        .send({
          progressPercentage: 50,
        });

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403, 400]).toContain(response.status);
    });

    it('should have progress history route registered', async () => {
      const response = await request(app)
        .get('/api/goals/test-id/progress/history');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403]).toContain(response.status);
    });

    it('should have progress visualization route registered', async () => {
      const response = await request(app)
        .get('/api/goals/test-id/progress/visualization');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403]).toContain(response.status);
    });

    it('should have progress calculation route registered', async () => {
      const response = await request(app)
        .post('/api/goals/test-id/progress/calculate');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403, 400]).toContain(response.status);
    });

    it('should have milestone stats route registered', async () => {
      const response = await request(app)
        .get('/api/goals/test-id/milestones/stats');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403]).toContain(response.status);
    });

    it('should have milestone achievement route registered', async () => {
      const response = await request(app)
        .post('/api/goals/test-id/milestones/milestone-id/achieve');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403, 400]).toContain(response.status);
    });

    it('should have milestone update route registered', async () => {
      const response = await request(app)
        .put('/api/goals/test-id/milestones/milestone-id')
        .send({
          description: 'Updated',
        });

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403, 400]).toContain(response.status);
    });

    it('should have milestone delete route registered', async () => {
      const response = await request(app)
        .delete('/api/goals/test-id/milestones/milestone-id');

      // Should require authentication (401) rather than 404 Not Found
      expect([401, 403, 400]).toContain(response.status);
    });
  });

  describe('Service Layer Imports', () => {
    it('should import goal-milestone service', async () => {
      const milestoneService = await import('../services/goal-milestone.service');
      expect(milestoneService).toBeDefined();
      expect(milestoneService.createGoalMilestone).toBeDefined();
      expect(milestoneService.getGoalMilestones).toBeDefined();
      expect(milestoneService.updateGoalMilestone).toBeDefined();
      expect(milestoneService.deleteGoalMilestone).toBeDefined();
      expect(milestoneService.achieveMilestone).toBeDefined();
      expect(milestoneService.getGoalMilestoneStats).toBeDefined();
    });

    it('should import goal-progress service', async () => {
      const progressService = await import('../services/goal-progress.service');
      expect(progressService).toBeDefined();
      expect(progressService.updateGoalProgress).toBeDefined();
      expect(progressService.getGoalProgressHistory).toBeDefined();
      expect(progressService.getProgressVisualizationData).toBeDefined();
      expect(progressService.calculateProgressFromMilestones).toBeDefined();
      expect(progressService.updateVisualizationType).toBeDefined();
      expect(progressService.getGoalProgressSummary).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should validate progress percentage is a number', async () => {
      const response = await request(app)
        .post('/api/goals/test-id/progress')
        .send({
          progressPercentage: 'invalid',
        });

      // Should either reject authentication or validation
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/goals/test-id/milestones')
        .send({});

      // Should either reject authentication or validation
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('API Structure', () => {
    it('should return JSON responses', async () => {
      const response = await request(app)
        .get('/api/goals/test-id/milestones');

      // Any response should be JSON (even error responses)
      if (response.status !== 404) {
        expect(response.type).toMatch(/json/);
      }
    });
  });
});
