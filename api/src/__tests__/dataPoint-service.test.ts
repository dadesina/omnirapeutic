/**
 * Data Point Service Unit Tests
 *
 * Tests business logic for data point management
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser, userToJwtPayload } from './helpers/auth.helper';
import {
  createTestTreatmentPlan,
  createTestGoal,
  createTestProgressNote,
  createTestDataPoint,
} from './helpers/treatmentPlan.helper';
import { createTestSession } from './helpers/session.helper';
import {
  createDataPoint,
  bulkCreateDataPoints,
  getDataPointsByGoal,
  getDataPointsBySession,
  deleteDataPoint,
} from '../services/dataPoint.service';

describe('Data Point Service', () => {
  describe('createDataPoint', () => {
    it('should create a data point with valid input', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const result = await createDataPoint(
        {
          goalId: goal.id,
          value: 8,
          unit: 'correct responses',
          notes: 'Patient showed improvement',
        },
        userToJwtPayload(admin)
      );

      expect(result.id).toBeDefined();
      expect(result.value).toBe(8);
      expect(result.unit).toBe('correct responses');
      expect(result.goalId).toBe(goal.id);
    });

    it('should create data point linked to session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      const result = await createDataPoint(
        {
          goalId: goal.id,
          sessionId: session.id,
          value: 10,
          unit: 'occurrences',
        },
        userToJwtPayload(admin)
      );

      expect(result.sessionId).toBe(session.id);
    });

    it('should create data point linked to progress note', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      const result = await createDataPoint(
        {
          goalId: goal.id,
          progressNoteId: progressNote.id,
          value: 12,
          unit: 'trials',
        },
        userToJwtPayload(admin)
      );

      expect(result.progressNoteId).toBe(progressNote.id);
    });

    it('should allow PRACTITIONER role to create data points', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await createDataPoint(
        {
          goalId: goal.id,
          value: 5,
          unit: 'attempts',
        },
        userToJwtPayload(practitioner)
      );

      expect(result.id).toBeDefined();
    });

    it('should reject PATIENT role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: patientUser.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: patientUser.organizationId!,
      });

      await expect(
        createDataPoint(
          {
            goalId: goal.id,
            value: 5,
            unit: 'attempts',
          },
          userToJwtPayload(patientUser)
        )
      ).rejects.toThrow('Forbidden');
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

      await expect(
        createDataPoint(
          {
            goalId: goal.id,
            value: 5,
            unit: 'attempts',
          },
          userToJwtPayload(admin1)
        )
      ).rejects.toThrow('different organization');
    });

    it('should return 404 for non-existent goal', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        createDataPoint(
          {
            goalId: 'non-existent-id',
            value: 5,
            unit: 'attempts',
          },
          userToJwtPayload(admin)
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('bulkCreateDataPoints', () => {
    it('should create multiple data points atomically', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal1 = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        title: 'Goal 1',
      });
      const goal2 = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        title: 'Goal 2',
      });

      const result = await bulkCreateDataPoints(
        {
          dataPoints: [
            { goalId: goal1.id, value: 5, unit: 'attempts' },
            { goalId: goal1.id, value: 7, unit: 'attempts' },
            { goalId: goal2.id, value: 10, unit: 'correct' },
          ],
        },
        userToJwtPayload(admin)
      );

      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(5);
      expect(result[1].value).toBe(7);
      expect(result[2].value).toBe(10);
    });

    it('should allow PRACTITIONER to bulk create', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await bulkCreateDataPoints(
        {
          dataPoints: [
            { goalId: goal.id, value: 5, unit: 'attempts' },
            { goalId: goal.id, value: 8, unit: 'attempts' },
          ],
        },
        userToJwtPayload(practitioner)
      );

      expect(result).toHaveLength(2);
    });

    it('should reject PATIENT role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: patientUser.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: patientUser.organizationId!,
      });

      await expect(
        bulkCreateDataPoints(
          {
            dataPoints: [{ goalId: goal.id, value: 5, unit: 'attempts' }],
          },
          userToJwtPayload(patientUser)
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should enforce multi-tenancy for all goals', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin2.organizationId!,
      });

      await expect(
        bulkCreateDataPoints(
          {
            dataPoints: [{ goalId: goal.id, value: 5, unit: 'attempts' }],
          },
          userToJwtPayload(admin1)
        )
      ).rejects.toThrow('different organization');
    });
  });

  describe('getDataPointsByGoal', () => {
    it('should retrieve all data points for a goal', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
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

      const result = await getDataPointsByGoal(goal.id, userToJwtPayload(admin));

      expect(result.dataPoints).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should support pagination', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      // Create 5 data points
      for (let i = 0; i < 5; i++) {
        await createTestDataPoint({
          goalId: goal.id,
          organizationId: admin.organizationId!,
          value: i + 1,
        });
      }

      const result = await getDataPointsByGoal(
        goal.id,
        userToJwtPayload(admin),
        { page: 1, limit: 3 }
      );

      expect(result.dataPoints).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(2);
    });

    it('should support date range filtering', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 5,
        date: yesterday,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 8,
        date: new Date(),
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        value: 10,
        date: nextWeek,
      });

      const result = await getDataPointsByGoal(
        goal.id,
        userToJwtPayload(admin),
        { startDate: yesterday, endDate: tomorrow }
      );

      expect(result.dataPoints).toHaveLength(2);
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

      await expect(
        getDataPointsByGoal(goal.id, userToJwtPayload(admin1))
      ).rejects.toThrow('different organization');
    });
  });

  describe('getDataPointsBySession', () => {
    it('should retrieve all data points for a session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        sessionId: session.id,
        value: 5,
      });
      await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin.organizationId!,
        sessionId: session.id,
        value: 8,
      });

      const result = await getDataPointsBySession(session.id, userToJwtPayload(admin));

      expect(result).toHaveLength(2);
      expect(result.every((dp: any) => dp.sessionId === session.id)).toBe(true);
    });

    it('should allow PRACTITIONER to view session data points', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });
      const session = await createTestSession({
        organizationId: practitioner.organizationId!,
      });

      await createTestDataPoint({
        goalId: goal.id,
        organizationId: practitioner.organizationId!,
        sessionId: session.id,
        value: 7,
      });

      const result = await getDataPointsBySession(session.id, userToJwtPayload(practitioner));

      expect(result).toHaveLength(1);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin2.organizationId!,
      });

      await expect(
        getDataPointsBySession(session.id, userToJwtPayload(admin1))
      ).rejects.toThrow('different organization');
    });
  });

  describe('deleteDataPoint', () => {
    it('should allow ADMIN to delete data points', async () => {
      const admin = await createTestUser(Role.ADMIN);
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
        value: 10,
      });

      const result = await deleteDataPoint(dataPoint.id, userToJwtPayload(admin));

      expect(result.message).toBe('Data point deleted successfully');

      // Verify deletion
      const deleted = await prisma.dataPoint.findUnique({
        where: { id: dataPoint.id },
      });
      expect(deleted).toBeNull();
    });

    it('should reject PRACTITIONER role', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: practitioner.organizationId!,
        value: 10,
      });

      await expect(
        deleteDataPoint(dataPoint.id, userToJwtPayload(practitioner))
      ).rejects.toThrow('Forbidden');
    });

    it('should reject PATIENT role', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
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
        value: 10,
      });

      await expect(
        deleteDataPoint(dataPoint.id, userToJwtPayload(patientUser))
      ).rejects.toThrow('Forbidden');
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
      const dataPoint = await createTestDataPoint({
        goalId: goal.id,
        organizationId: admin2.organizationId!,
        value: 10,
      });

      await expect(
        deleteDataPoint(dataPoint.id, userToJwtPayload(admin1))
      ).rejects.toThrow('different organization');
    });
  });
});
