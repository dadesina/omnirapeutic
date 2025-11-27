/**
 * Test Helper Functions for Treatment Plans
 *
 * Factory functions for creating test treatment plans, goals, progress notes, and data points
 */

import { TreatmentPlanStatus, GoalType, GoalStatus } from '@prisma/client';
import { prisma } from '../setup';
import { createTestUser } from './auth.helper';
import { createCompleteTestPatient } from './factories';
import { createTestAuthorization, createTestServiceCode } from './appointment.helper';

// ============================================================================
// TREATMENT PLAN HELPERS
// ============================================================================

export interface CreateTestTreatmentPlanOptions {
  organizationId: string;
  patientId?: string;
  createdByUserId?: string;
  authorizationId?: string;
  title?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  reviewDate?: Date;
  status?: TreatmentPlanStatus;
}

export async function createTestTreatmentPlan(
  options: CreateTestTreatmentPlanOptions
) {
  let patientId = options.patientId;
  let createdByUserId = options.createdByUserId;
  let authorizationId = options.authorizationId;

  // Create patient if not provided
  if (!patientId) {
    const { patient } = await createCompleteTestPatient('Test123!@#', options.organizationId);
    patientId = patient.id;
  }

  // Create BCBA user if not provided
  if (!createdByUserId) {
    const bcbaUser = await createTestUser('ADMIN' as any);
    createdByUserId = bcbaUser.id;
  }

  // Create authorization if not provided (optional)
  if (!authorizationId && options.authorizationId !== null) {
    const serviceCode = await createTestServiceCode(options.organizationId);
    const authorization = await createTestAuthorization({
      patientId: patientId!,
      serviceCodeId: serviceCode.id,
      organizationId: options.organizationId,
      totalUnits: 100,
    });
    authorizationId = authorization.id;
  }

  const now = new Date();
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
  const sixMonthsLater = new Date(now);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

  return await prisma.treatmentPlan.create({
    data: {
      organizationId: options.organizationId,
      patientId: patientId!,
      createdByUserId: createdByUserId!,
      authorizationId: authorizationId || undefined,
      title: options.title || 'ABA Treatment Plan - Functional Communication',
      description:
        options.description ||
        'Comprehensive ABA treatment plan focusing on increasing functional communication, reducing problem behaviors, and improving social skills.',
      startDate: options.startDate || now,
      endDate: options.endDate || sixMonthsLater,
      reviewDate: options.reviewDate || threeMonthsLater,
      status: options.status || TreatmentPlanStatus.ACTIVE,
    },
    include: {
      patient: true,
      createdBy: true,
      authorization: true,
    },
  });
}

// ============================================================================
// GOAL HELPERS
// ============================================================================

export interface CreateTestGoalOptions {
  treatmentPlanId: string;
  organizationId: string;
  title?: string;
  description?: string;
  goalType?: GoalType;
  domain?: string;
  baseline?: any;
  targetCriteria?: string;
  measurementMethod?: string;
  status?: GoalStatus;
  masteryDate?: Date | null;
}

export async function createTestGoal(options: CreateTestGoalOptions) {
  return await prisma.goal.create({
    data: {
      treatmentPlanId: options.treatmentPlanId,
      organizationId: options.organizationId,
      title: options.title || 'Increase Mand Requests',
      description:
        options.description ||
        'Patient will independently mand (request) for preferred items using verbal or gestural communication.',
      goalType: options.goalType || GoalType.SHORT_TERM,
      domain: options.domain || 'Communication',
      baseline: options.baseline || {
        value: 2,
        unit: 'mands per session',
        date: new Date().toISOString(),
      },
      targetCriteria:
        options.targetCriteria ||
        'Patient will independently mand for 10+ items per session with 80% accuracy across 3 consecutive sessions.',
      measurementMethod:
        options.measurementMethod || 'Frequency count per session',
      status: options.status || GoalStatus.ACTIVE,
      masteryDate: options.masteryDate === null ? null : options.masteryDate,
    },
    include: {
      treatmentPlan: true,
      dataPoints: true,
    },
  });
}

// Helper to create multiple goals for a treatment plan
export async function createTestGoalsSet(
  treatmentPlanId: string,
  organizationId: string
) {
  const communicationGoal = await createTestGoal({
    treatmentPlanId,
    organizationId,
    title: 'Increase Mand Requests',
    domain: 'Communication',
    goalType: GoalType.SHORT_TERM,
  });

  const socialGoal = await createTestGoal({
    treatmentPlanId,
    organizationId,
    title: 'Initiate Social Interactions',
    domain: 'Social Skills',
    description:
      'Patient will initiate social interactions with peers during structured play activities.',
    goalType: GoalType.LONG_TERM,
    baseline: { value: 1, unit: 'initiations per session' },
    targetCriteria:
      '5+ peer initiations per session with 70% success rate across 5 consecutive sessions.',
  });

  const behaviorGoal = await createTestGoal({
    treatmentPlanId,
    organizationId,
    title: 'Reduce Tantrum Behaviors',
    domain: 'Behavior Reduction',
    description:
      'Patient will decrease the frequency and duration of tantrum behaviors when presented with non-preferred tasks.',
    goalType: GoalType.SHORT_TERM,
    baseline: { value: 8, unit: 'tantrums per day', duration: 5 },
    targetCriteria:
      'Less than 2 tantrums per day, each lasting less than 2 minutes, across 5 consecutive days.',
    measurementMethod: 'Frequency and duration tracking',
  });

  return [communicationGoal, socialGoal, behaviorGoal];
}

// ============================================================================
// PROGRESS NOTE HELPERS
// ============================================================================

export interface CreateTestProgressNoteOptions {
  sessionId: string;
  organizationId: string;
  createdByUserId?: string;
  treatmentPlanId?: string;
  narrative?: string;
  behaviorObservations?: string;
  interventionsUsed?: string;
  recommendedAdjustments?: string;
}

export async function createTestProgressNote(
  options: CreateTestProgressNoteOptions
) {
  let createdByUserId = options.createdByUserId;

  // Create user if not provided
  if (!createdByUserId) {
    const practitioner = await createTestUser('ADMIN' as any);
    createdByUserId = practitioner.id;
  }

  return await prisma.progressNote.create({
    data: {
      sessionId: options.sessionId,
      organizationId: options.organizationId,
      createdByUserId: createdByUserId!,
      treatmentPlanId: options.treatmentPlanId,
      narrative:
        options.narrative ||
        'Patient demonstrated increased engagement during manding activities. Successfully requested 8 preferred items using verbal approximations. Required minimal prompting for task completion.',
      behaviorObservations:
        options.behaviorObservations ||
        'Patient exhibited 2 brief tantrums (< 30 seconds each) when transitioning between activities. Responded well to visual schedule and first-then contingencies.',
      interventionsUsed:
        options.interventionsUsed ||
        'Discrete Trial Training (DTT) for manding, Natural Environment Teaching (NET) for social interactions, visual supports for transitions.',
      recommendedAdjustments:
        options.recommendedAdjustments ||
        'Continue current programming. Consider increasing difficulty of manding targets by introducing new items.',
    },
    include: {
      session: true,
      treatmentPlan: true,
      createdBy: true,
      dataPoints: true,
    },
  });
}

// ============================================================================
// DATA POINT HELPERS
// ============================================================================

export interface CreateTestDataPointOptions {
  goalId: string;
  organizationId: string;
  sessionId?: string;
  progressNoteId?: string;
  date?: Date;
  value: number;
  unit?: string;
  notes?: string;
}

export async function createTestDataPoint(options: CreateTestDataPointOptions) {
  return await prisma.dataPoint.create({
    data: {
      goalId: options.goalId,
      organizationId: options.organizationId,
      sessionId: options.sessionId,
      progressNoteId: options.progressNoteId,
      date: options.date || new Date(),
      value: options.value,
      unit: options.unit || 'count',
      notes: options.notes,
    },
    include: {
      goal: true,
      session: true,
      progressNote: true,
    },
  });
}

// Helper to create multiple data points for trend analysis
export async function createTestDataPointSeries(
  goalId: string,
  organizationId: string,
  count: number = 10
): Promise<any[]> {
  const dataPoints = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (count - i)); // Go back in time

    // Simulate improving trend
    const baseValue = 2;
    const improvement = i * 0.8;
    const value = Math.round(baseValue + improvement);

    const dataPoint = await createTestDataPoint({
      goalId,
      organizationId,
      date,
      value,
      unit: 'mands',
      notes: `Session ${i + 1} data`,
    });

    dataPoints.push(dataPoint);
  }

  return dataPoints;
}

// Helper to create bulk data points atomically
export async function createBulkTestDataPoints(
  dataPoints: CreateTestDataPointOptions[]
) {
  return await prisma.$transaction(
    dataPoints.map((dp) =>
      prisma.dataPoint.create({
        data: {
          goalId: dp.goalId,
          organizationId: dp.organizationId,
          sessionId: dp.sessionId,
          progressNoteId: dp.progressNoteId,
          date: dp.date || new Date(),
          value: dp.value,
          unit: dp.unit || 'count',
          notes: dp.notes,
        },
      })
    )
  );
}

// ============================================================================
// COMPLETE WORKFLOW HELPERS
// ============================================================================

/**
 * Creates a complete treatment plan with goals, sessions, progress notes, and data points
 * Useful for E2E workflow testing
 */
export async function createCompleteTreatmentPlanWorkflow(
  organizationId: string
) {
  // Create treatment plan
  const treatmentPlan = await createTestTreatmentPlan({ organizationId });

  // Create goals
  const [communicationGoal, socialGoal, behaviorGoal] = await createTestGoalsSet(
    treatmentPlan.id,
    organizationId
  );

  return {
    treatmentPlan,
    goals: {
      communication: communicationGoal,
      social: socialGoal,
      behavior: behaviorGoal,
    },
  };
}
