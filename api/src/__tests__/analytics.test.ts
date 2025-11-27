/**
 * Analytics Endpoint Tests
 *
 * Tests for Analytics API endpoints with RBAC
 * Phase 6 - Stage 1: Core Analytics Service
 *
 * Tests:
 * - Goal trend analysis
 * - Patient progress summary
 * - Organization metrics
 * - RBAC enforcement
 * - Multi-tenancy validation
 * - Date range filtering
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser, generateTestToken } from './helpers/auth.helper';
import {
  createTestTreatmentPlan,
  createTestGoal,
  createTestDataPoint,
} from './helpers/treatmentPlan.helper';
import { createTestSession } from './helpers/session.helper';
import { createCompleteTestPatient } from './helpers/factories';
import { Role, GoalType, TreatmentPlanStatus } from '@prisma/client';

let app: Application;

describe('Analytics Endpoints', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  // ============================================================================
  // Goal Trend Analysis
  // ============================================================================

  describe('GET /api/goals/:goalId/trend - Goal Trend Analysis', () => {
    it('should retrieve goal trend data as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
        baseline: { value: 2, unit: 'mands' },
      });

      // Create data points showing improvement
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 2,
        unit: 'mands',
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 5,
        unit: 'mands',
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 8,
        unit: 'mands',
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/trend`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('goalId', goal.id);
      expect(response.body).toHaveProperty('goalTitle');
      expect(response.body).toHaveProperty('domain');
      expect(response.body).toHaveProperty('progress');
      expect(response.body.progress).toHaveProperty('totalDataPoints', 3);
      expect(response.body.progress).toHaveProperty('trend');
      expect(response.body).toHaveProperty('dataPointsByDate');
      expect(response.body.dataPointsByDate).toHaveLength(3);
    });

    it('should retrieve goal trend data as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: practitioner.organizationId!,
        value: 10,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/trend`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.goalId).toBe(goal.id);
      expect(response.body.progress.totalDataPoints).toBe(1);
    });

    it('should allow PATIENT to view their own goal trend', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { user: patientUser, patient } = await createCompleteTestPatient(
        'Patient123!@#',
        practitioner.organizationId!
      );

      // Generate token for the patient user
      const patientToken = generateTestToken(
        patientUser.id,
        patientUser.email,
        patientUser.role,
        patientUser.organizationId,
        patientUser.isSuperAdmin
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: practitioner.organizationId!,
        value: 5,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/trend`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.goalId).toBe(goal.id);
    });

    it('should filter data points by date range', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const today = new Date();

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
        date: today,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 3,
        date: tomorrow,
      });

      const response = await request(app)
        .get(`/api/goals/${goal.id}/trend`)
        .query({ startDate: today.toISOString() })
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      // Should only include today and future data points
      expect(response.body.dataPointsByDate.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject invalid date format', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      await request(app)
        .get(`/api/goals/${goal.id}/trend`)
        .query({ startDate: 'invalid-date' })
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });

    it('should return 404 for non-existent goal', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/goals/non-existent-id/trend')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });
      const goal = await createTestGoal({
        organizationId: admin2.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      await request(app)
        .get(`/api/goals/${goal.id}/trend`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });

  // ============================================================================
  // Patient Progress Summary
  // ============================================================================

  describe('GET /api/patients/:patientId/progress-summary - Patient Progress Summary', () => {
    it('should retrieve patient progress summary as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'Patient456!@#',
        admin.organizationId!
      );

      // Create treatment plan with goals
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        status: TreatmentPlanStatus.ACTIVE,
      });

      const goal1 = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
        title: 'Communication Goal',
        domain: 'Communication',
        baseline: { value: 2, unit: 'mands' },
      });

      const goal2 = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
        title: 'Social Skills Goal',
        domain: 'Social Skills',
        baseline: { value: 0, unit: 'interactions' },
      });

      // Add data points
      await createTestDataPoint({
        goalId: goal1.id,
        organizationId: admin.organizationId!,
        value: 2,
      });
      await createTestDataPoint({
        goalId: goal1.id,
        organizationId: admin.organizationId!,
        value: 5,
      });
      await createTestDataPoint({
        goalId: goal2.id,
        organizationId: admin.organizationId!,
        value: 1,
      });

      const response = await request(app)
        .get(`/api/patients/${patient.id}/progress-summary`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('patientId', patient.id);
      expect(response.body).toHaveProperty('patientName');
      expect(response.body).toHaveProperty('treatmentPlans');
      expect(response.body.treatmentPlans).toHaveLength(1);
      expect(response.body.treatmentPlans[0].goals).toHaveLength(2);
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary.totalGoals).toBe(2);
      expect(response.body.summary.totalDataPoints).toBe(3);
    });

    it('should retrieve progress summary as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient(
        'Patient789!@#',
        practitioner.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const response = await request(app)
        .get(`/api/patients/${patient.id}/progress-summary`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.patientId).toBe(patient.id);
      expect(response.body.treatmentPlans).toHaveLength(1);
    });

    it('should allow PATIENT to view their own progress summary', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { user: patientUser, patient } = await createCompleteTestPatient(
        'PatientABC!@#',
        practitioner.organizationId!
      );

      // Generate token for the patient user
      const patientToken = generateTestToken(
        patientUser.id,
        patientUser.email,
        patientUser.role,
        patientUser.organizationId,
        patientUser.isSuperAdmin
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: practitioner.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const response = await request(app)
        .get(`/api/patients/${patient.id}/progress-summary`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.patientId).toBe(patient.id);
    });

    it('should filter by date range', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'PatientDEF!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const today = new Date();

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
        date: today,
      });

      const response = await request(app)
        .get(`/api/patients/${patient.id}/progress-summary`)
        .query({ startDate: today.toISOString() })
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      // Summary should reflect filtered data
      expect(response.body.summary.totalDataPoints).toBe(1);
    });

    it('should return 404 for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await request(app)
        .get('/api/patients/non-existent-id/progress-summary')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'PatientGHI!@#',
        admin2.organizationId!
      );

      await request(app)
        .get(`/api/patients/${patient.id}/progress-summary`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });

    it('should reject PATIENT viewing other patients', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient: patient1 } = await createCompleteTestPatient(
        'Patient1JKL!@#',
        practitioner.organizationId!
      );
      const patient2User = await createTestUser(Role.PATIENT, false, practitioner.organizationId!);

      await request(app)
        .get(`/api/patients/${patient1.id}/progress-summary`)
        .set('Authorization', `Bearer ${patient2User.token}`)
        .expect(403);
    });
  });

  // ============================================================================
  // Organization Metrics
  // ============================================================================

  describe('GET /api/organizations/:orgId/metrics - Organization Metrics', () => {
    it('should retrieve organization metrics as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);

      // Create test data
      const { patient } = await createCompleteTestPatient(
        'PatientPQR!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        status: TreatmentPlanStatus.ACTIVE,
      });

      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 5,
      });

      const session = await createTestSession({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        unitsUsed: 4,
      });

      const response = await request(app)
        .get(`/api/organizations/${admin.organizationId}/metrics`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('organizationId', admin.organizationId);
      expect(response.body).toHaveProperty('patientMetrics');
      expect(response.body.patientMetrics.totalPatients).toBeGreaterThanOrEqual(1);
      expect(response.body).toHaveProperty('treatmentPlanMetrics');
      expect(response.body.treatmentPlanMetrics.totalTreatmentPlans).toBeGreaterThanOrEqual(1);
      expect(response.body).toHaveProperty('goalMetrics');
      expect(response.body.goalMetrics.totalGoals).toBeGreaterThanOrEqual(1);
      expect(response.body).toHaveProperty('sessionMetrics');
      expect(response.body.sessionMetrics.totalSessions).toBeGreaterThanOrEqual(1);
      expect(response.body).toHaveProperty('dataCollectionMetrics');
      expect(response.body.dataCollectionMetrics.totalDataPoints).toBeGreaterThanOrEqual(1);
    });

    it('should reject organization metrics as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);

      await request(app)
        .get(`/api/organizations/${practitioner.organizationId}/metrics`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);
    });

    it('should reject organization metrics as PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .get(`/api/organizations/${admin.organizationId}/metrics`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });

    it('should filter metrics by date range', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'PatientSTU!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 1,
        date: yesterday,
      });

      const response = await request(app)
        .get(`/api/organizations/${admin.organizationId}/metrics`)
        .query({ startDate: new Date().toISOString() })
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      // Metrics should be filtered by date
      expect(response.body.organizationId).toBe(admin.organizationId);
    });

    it('should enforce multi-tenancy for organization metrics', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);

      await request(app)
        .get(`/api/organizations/${admin2.organizationId}/metrics`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });

    it('should calculate trend-based goal metrics correctly', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'PatientVWX!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      // Create goal with improving trend
      const improvingGoal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
        baseline: { value: 2, unit: 'count' },
      });

      await createTestDataPoint({
        goalId: improvingGoal.id,
        organizationId: admin.organizationId!,
        value: 2,
      });
      await createTestDataPoint({
        goalId: improvingGoal.id,
        organizationId: admin.organizationId!,
        value: 5,
      });

      const response = await request(app)
        .get(`/api/organizations/${admin.organizationId}/metrics`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.goalMetrics.improvingGoals).toBeGreaterThanOrEqual(1);
    });

    it('should calculate weekly and monthly data points correctly', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'PatientYZ!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      // Create data points today
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 1,
        date: new Date(),
      });

      const response = await request(app)
        .get(`/api/organizations/${admin.organizationId}/metrics`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.dataCollectionMetrics.dataPointsThisWeek).toBeGreaterThanOrEqual(1);
      expect(response.body.dataCollectionMetrics.dataPointsThisMonth).toBeGreaterThanOrEqual(1);
    });

    it('should calculate average data points per session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient(
        'Patient123ABC!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const goal = await createTestGoal({
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const session = await createTestSession({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      // Add 3 data points for 1 session = 3.0 average
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 1,
        sessionId: session.id,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 2,
        sessionId: session.id,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 3,
        sessionId: session.id,
      });

      const response = await request(app)
        .get(`/api/organizations/${admin.organizationId}/metrics`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.dataCollectionMetrics.averageDataPointsPerSession).toBeGreaterThan(0);
    });
  });
});
