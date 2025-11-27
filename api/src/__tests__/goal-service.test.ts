/**
 * Goal Service Unit Tests
 *
 * Tests business logic for goal management
 */

import { Role, GoalType, GoalStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser, userToJwtPayload } from './helpers/auth.helper';
import { createTestTreatmentPlan, createTestGoal, createTestDataPoint } from './helpers/treatmentPlan.helper';
import {
  createGoal,
  getGoalById,
  getGoalsByTreatmentPlan,
  updateGoal,
  markGoalAsMet,
  calculateGoalProgress,
} from '../services/goal.service';

describe('Goal Service', () => {
  describe('createGoal', () => {
    it('should create a goal with valid input', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const result = await createGoal(
        {
          treatmentPlanId: treatmentPlan.id,
          title: 'Increase Communication',
          description: 'Patient will use more verbal communication',
          goalType: GoalType.SHORT_TERM,
          domain: 'Communication',
          baseline: { value: 2, unit: 'mands' },
          targetCriteria: '10+ mands per session with 80% accuracy',
          measurementMethod: 'Frequency count',
        },
        admin.user
      );

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Increase Communication');
      expect(result.status).toBe(GoalStatus.ACTIVE);
      expect(result.goalType).toBe(GoalType.SHORT_TERM);
    });

    it('should allow PRACTITIONER role to create goals', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });

      const result = await createGoal(
        {
          treatmentPlanId: treatmentPlan.id,
          title: 'Test Goal',
          description: 'Test description',
          goalType: GoalType.LONG_TERM,
          domain: 'Social Skills',
          targetCriteria: 'Test criteria',
          measurementMethod: 'Test method',
        },
        practitioner.user
      );

      expect(result.id).toBeDefined();
    });

    it('should reject PATIENT role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: patientUser.organizationId!,
      });

      await expect(
        createGoal(
          {
            treatmentPlanId: treatmentPlan.id,
            title: 'Test Goal',
            description: 'Test description',
            goalType: GoalType.SHORT_TERM,
            domain: 'Communication',
            targetCriteria: 'Test criteria',
            measurementMethod: 'Test method',
          },
          patientUser.user
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await expect(
        createGoal(
          {
            treatmentPlanId: treatmentPlan.id,
            title: 'Test Goal',
            description: 'Test description',
            goalType: GoalType.SHORT_TERM,
            domain: 'Communication',
            targetCriteria: 'Test criteria',
            measurementMethod: 'Test method',
          },
          admin1.user
        )
      ).rejects.toThrow('different organization');
    });

    it('should return 404 for non-existent treatment plan', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        createGoal(
          {
            treatmentPlanId: 'non-existent-id',
            title: 'Test Goal',
            description: 'Test description',
            goalType: GoalType.SHORT_TERM,
            domain: 'Communication',
            targetCriteria: 'Test criteria',
            measurementMethod: 'Test method',
          },
          admin.user
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('getGoalById', () => {
    it('should retrieve goal by ID', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const result = await getGoalById(goal.id, admin.user);

      expect(result.id).toBe(goal.id);
      expect(result.title).toBeDefined();
      expect(result.treatmentPlan).toBeDefined();
    });

    it('should allow PRACTITIONER to view goals', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await getGoalById(goal.id, practitioner.user);

      expect(result.id).toBe(goal.id);
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

      await expect(getGoalById(goal.id, admin1.user)).rejects.toThrow('different organization');
    });
  });

  describe('getGoalsByTreatmentPlan', () => {
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

      const result = await getGoalsByTreatmentPlan(treatmentPlan.id, admin.user);

      expect(result).toHaveLength(2);
      expect(result.every((g: any) => g.treatmentPlanId === treatmentPlan.id)).toBe(true);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await expect(getGoalsByTreatmentPlan(treatmentPlan.id, admin1.user)).rejects.toThrow(
        'different organization'
      );
    });
  });

  describe('updateGoal', () => {
    it('should update goal fields', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
      });

      const result = await updateGoal(
        goal.id,
        {
          title: 'Updated Title',
          description: 'Updated description',
        },
        admin.user
      );

      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Updated description');
    });

    it('should allow PRACTITIONER to update goals', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await updateGoal(
        goal.id,
        { title: 'Updated by Practitioner' },
        practitioner.user
      );

      expect(result.title).toBe('Updated by Practitioner');
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

      await expect(
        updateGoal(goal.id, { title: 'Updated' }, patientUser.user)
      ).rejects.toThrow('Forbidden');
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

      await expect(updateGoal(goal.id, { title: 'Updated' }, admin.user)).rejects.toThrow(
        'met or discontinued'
      );
    });
  });

  describe('markGoalAsMet', () => {
    it('should mark ACTIVE goal as MET', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: admin.organizationId!,
        status: GoalStatus.ACTIVE,
      });

      const result = await markGoalAsMet(goal.id, admin.user);

      expect(result.status).toBe(GoalStatus.MET);
      expect(result.masteryDate).toBeDefined();
    });

    it('should allow PRACTITIONER to mark goals as met', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });
      const goal = await createTestGoal({
        treatmentPlanId: treatmentPlan.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await markGoalAsMet(goal.id, practitioner.user);

      expect(result.status).toBe(GoalStatus.MET);
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

      await expect(markGoalAsMet(goal.id, patientUser.user)).rejects.toThrow('Forbidden');
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

      await expect(markGoalAsMet(goal.id, admin.user)).rejects.toThrow(
        'active or modified goals'
      );
    });
  });

  describe('calculateGoalProgress', () => {
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

      const result = await calculateGoalProgress(goal.id, admin.user);

      expect(result.progress.totalDataPoints).toBe(3);
      expect(result.progress.firstValue).toBe(2);
      expect(result.progress.latestValue).toBe(8);
      expect(result.progress.trend).toBe('IMPROVING');
      expect(result.progress.percentageChange).toBeGreaterThan(0);
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

      const result = await calculateGoalProgress(goal.id, admin.user);

      expect(result.progress.totalDataPoints).toBe(0);
      expect(result.progress.trend).toBe('NO_DATA');
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

      await expect(calculateGoalProgress(goal.id, admin1.user)).rejects.toThrow(
        'different organization'
      );
    });
  });
});
