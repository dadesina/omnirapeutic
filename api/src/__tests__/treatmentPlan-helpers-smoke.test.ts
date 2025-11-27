/**
 * Smoke Tests for Treatment Plan Test Helpers
 *
 * Validates that factory functions work correctly
 */

import { TreatmentPlanStatus, GoalType, GoalStatus } from '@prisma/client';
import { prisma } from './setup';
import {
  createTestTreatmentPlan,
  createTestGoal,
  createTestGoalsSet,
  createTestProgressNote,
  createTestDataPoint,
  createTestDataPointSeries,
  createBulkTestDataPoints,
  createCompleteTreatmentPlanWorkflow,
} from './helpers/treatmentPlan.helper';
import { createTestUser } from './helpers/auth.helper';
import { createTestAppointment } from './helpers/appointment.helper';

describe('Treatment Plan Helper Smoke Tests', () => {
  describe('createTestTreatmentPlan', () => {
    it('should create a valid treatment plan with all dependencies', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      expect(treatmentPlan.id).toBeDefined();
      expect(treatmentPlan.title).toBeDefined();
      expect(treatmentPlan.status).toBe(TreatmentPlanStatus.ACTIVE);
      expect(treatmentPlan.patient).toBeDefined();
      expect(treatmentPlan.createdBy).toBeDefined();
    });

    it('should create treatment plan with custom status', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.DRAFT,
      });

      expect(treatmentPlan.status).toBe(TreatmentPlanStatus.DRAFT);
    });
  });

  describe('createTestGoal', () => {
    it('should create a valid goal linked to treatment plan', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      expect(goal.id).toBeDefined();
      expect(goal.title).toBeDefined();
      expect(goal.goalType).toBe(GoalType.SHORT_TERM);
      expect(goal.status).toBe(GoalStatus.ACTIVE);
      expect(goal.treatmentPlan).toBeDefined();
    });

    it('should create goal with custom properties', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        title: 'Custom Goal',
        goalType: GoalType.LONG_TERM,
        domain: 'Self-Care',
      });

      expect(goal.title).toBe('Custom Goal');
      expect(goal.goalType).toBe(GoalType.LONG_TERM);
      expect(goal.domain).toBe('Self-Care');
    });
  });

  describe('createTestGoalsSet', () => {
    it('should create 3 goals with different domains', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const goals = await createTestGoalsSet(
        treatmentPlan.id,
        admin.organizationId!
      );

      expect(goals).toHaveLength(3);
      expect(goals[0].domain).toBe('Communication');
      expect(goals[1].domain).toBe('Social Skills');
      expect(goals[2].domain).toBe('Behavior Reduction');
    });
  });

  describe('createTestProgressNote', () => {
    it('should create a valid progress note linked to session', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
      });

      // Create session manually
      const session = await prisma.session.create({
        data: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          practitionerId: appointment.practitionerId,
          serviceCodeId: appointment.serviceCodeId,
          organizationId: admin.organizationId!,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          unitsUsed: 4,
          status: 'COMPLETED',
        },
      });

      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      expect(progressNote.id).toBeDefined();
      expect(progressNote.narrative).toBeDefined();
      expect(progressNote.session).toBeDefined();
      expect(progressNote.sessionId).toBe(session.id);
    });

    it('should create progress note with custom narrative', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
      });

      const session = await prisma.session.create({
        data: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          practitionerId: appointment.practitionerId,
          serviceCodeId: appointment.serviceCodeId,
          organizationId: admin.organizationId!,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          unitsUsed: 4,
          status: 'COMPLETED',
        },
      });

      const customNarrative = 'Custom session narrative for testing.';
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
        narrative: customNarrative,
      });

      expect(progressNote.narrative).toBe(customNarrative);
    });
  });

  describe('createTestDataPoint', () => {
    it('should create a valid data point linked to goal', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 5,
        unit: 'mands',
      });

      expect(dataPoint.id).toBeDefined();
      expect(dataPoint.value).toBe(5);
      expect(dataPoint.unit).toBe('mands');
      expect(dataPoint.goal).toBeDefined();
    });

    it('should create data point with custom date', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const customDate = new Date('2025-01-01');
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 10,
        date: customDate,
      });

      expect(dataPoint.date.toISOString().split('T')[0]).toBe('2025-01-01');
    });
  });

  describe('createTestDataPointSeries', () => {
    it('should create a series of data points with increasing values', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const dataPoints = await createTestDataPointSeries(
        goal.id,
        admin.organizationId!,
        5
      );

      expect(dataPoints).toHaveLength(5);
      // Verify trend: later data points should have higher values
      expect(dataPoints[4].value).toBeGreaterThan(dataPoints[0].value);
    });
  });

  describe('createBulkTestDataPoints', () => {
    it('should create multiple data points atomically', async () => {
      const admin = await createTestUser('ADMIN' as any);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const dataPoints = await createBulkTestDataPoints([
        {
          goalId: goal.id,
          organizationId: admin.organizationId!,
          value: 3,
          unit: 'count',
        },
        {
          goalId: goal.id,
          organizationId: admin.organizationId!,
          value: 5,
          unit: 'count',
        },
        {
          goalId: goal.id,
          organizationId: admin.organizationId!,
          value: 7,
          unit: 'count',
        },
      ]);

      expect(dataPoints).toHaveLength(3);
      expect(dataPoints[0].value).toBe(3);
      expect(dataPoints[1].value).toBe(5);
      expect(dataPoints[2].value).toBe(7);
    });
  });

  describe('createCompleteTreatmentPlanWorkflow', () => {
    it('should create a complete workflow with plan and 3 goals', async () => {
      const admin = await createTestUser('ADMIN' as any);

      const workflow = await createCompleteTreatmentPlanWorkflow(
        admin.organizationId!
      );

      expect(workflow.treatmentPlan.id).toBeDefined();
      expect(workflow.goals.communication).toBeDefined();
      expect(workflow.goals.social).toBeDefined();
      expect(workflow.goals.behavior).toBeDefined();

      // Verify goals are linked to the treatment plan
      expect(workflow.goals.communication.treatmentPlanId).toBe(
        workflow.treatmentPlan.id
      );
    });
  });
});
