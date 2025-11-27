/**
 * Goal Service
 *
 * Business logic for managing treatment goals
 * HIPAA Compliance: All operations are audited
 */

import { GoalType, GoalStatus, Role } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CreateGoalInput {
  treatmentPlanId: string;
  title: string;
  description: string;
  goalType: GoalType;
  domain: string;
  baseline?: any;
  targetCriteria: string;
  measurementMethod: string;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  domain?: string;
  baseline?: any;
  targetCriteria?: string;
  measurementMethod?: string;
}

export interface GoalProgressData {
  goal: any;
  progress: {
    totalDataPoints: number;
    firstValue: number | null;
    latestValue: number | null;
    averageValue: number | null;
    trend: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'NO_DATA';
    percentageChange: number | null;
  };
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new goal
 * RBAC: ADMIN and PRACTITIONER (BCBA) only
 */
export async function createGoal(input: CreateGoalInput, user: JwtPayload) {
  // RBAC: Only ADMIN and PRACTITIONER can create goals
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can create goals');
  }

  // Verify treatment plan exists and belongs to user's organization
  const treatmentPlan = await prisma.treatmentPlan.findUnique({
    where: { id: input.treatmentPlanId },
    include: { patient: true },
  });

  if (!treatmentPlan) {
    throw new Error('Treatment plan not found');
  }

  if (treatmentPlan.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Treatment plan belongs to different organization');
  }

  // Create goal
  const goal = await prisma.goal.create({
    data: {
      treatmentPlanId: input.treatmentPlanId,
      organizationId: user.organizationId!,
      title: input.title,
      description: input.description,
      goalType: input.goalType,
      domain: input.domain,
      baseline: input.baseline,
      targetCriteria: input.targetCriteria,
      measurementMethod: input.measurementMethod,
      status: GoalStatus.ACTIVE,
    },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'CREATE_GOAL',
    resource: 'goal',
    resourceId: goal.id,
    organizationId: user.organizationId!,
    details: {
      treatmentPlanId: input.treatmentPlanId,
      title: input.title,
      domain: input.domain,
    },
  });

  return goal;
}

/**
 * Get goal by ID
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getGoalById(goalId: string, user: JwtPayload) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
      dataPoints: {
        orderBy: { date: 'desc' },
        take: 20, // Latest 20 data points
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  // Multi-tenancy check
  if (goal.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Goal belongs to different organization');
  }

  // RBAC: Patients can only view their own goals
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || goal.treatmentPlan.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own goals');
    }
  }

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_GOAL',
    resource: 'goal',
    resourceId: goal.id,
    organizationId: user.organizationId!,
  });

  return goal;
}

/**
 * Get goals by treatment plan
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getGoalsByTreatmentPlan(
  treatmentPlanId: string,
  user: JwtPayload
) {
  // Verify treatment plan exists and user has access
  const treatmentPlan = await prisma.treatmentPlan.findUnique({
    where: { id: treatmentPlanId },
    include: { patient: true },
  });

  if (!treatmentPlan) {
    throw new Error('Treatment plan not found');
  }

  if (treatmentPlan.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Treatment plan belongs to different organization');
  }

  // RBAC: Patients can only view their own treatment plan goals
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || treatmentPlan.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own goals');
    }
  }

  const goals = await prisma.goal.findMany({
    where: {
      treatmentPlanId,
      organizationId: user.organizationId!,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      dataPoints: {
        orderBy: { date: 'desc' },
        take: 5, // Latest 5 data points per goal
      },
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_GOAL',
    resource: 'goal',
    organizationId: user.organizationId!,
    details: {
      treatmentPlanId,
      resultCount: goals.length,
    },
  });

  return goals;
}

/**
 * Update goal
 * RBAC: ADMIN and PRACTITIONER (BCBA) only
 */
export async function updateGoal(
  goalId: string,
  input: UpdateGoalInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can update goals
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can update goals');
  }

  // Fetch existing goal
  const existing = await prisma.goal.findUnique({
    where: { id: goalId },
  });

  if (!existing) {
    throw new Error('Goal not found');
  }

  // Multi-tenancy check
  if (existing.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Goal belongs to different organization');
  }

  // Cannot update MET or DISCONTINUED goals
  if (existing.status === GoalStatus.MET || existing.status === GoalStatus.DISCONTINUED) {
    throw new Error('Cannot update goals that are met or discontinued');
  }

  // Update goal
  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: {
      title: input.title,
      description: input.description,
      domain: input.domain,
      baseline: input.baseline,
      targetCriteria: input.targetCriteria,
      measurementMethod: input.measurementMethod,
    },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'UPDATE_GOAL',
    resource: 'goal',
    resourceId: goalId,
    organizationId: user.organizationId!,
    details: {
      changes: input,
    },
  });

  return updated;
}

/**
 * Mark goal as met
 * RBAC: ADMIN and PRACTITIONER (BCBA) only
 */
export async function markGoalAsMet(goalId: string, user: JwtPayload) {
  // RBAC: Only ADMIN and PRACTITIONER can mark goals as met
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can mark goals as met');
  }

  // Fetch existing goal
  const existing = await prisma.goal.findUnique({
    where: { id: goalId },
  });

  if (!existing) {
    throw new Error('Goal not found');
  }

  // Multi-tenancy check
  if (existing.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Goal belongs to different organization');
  }

  // Can only mark ACTIVE or MODIFIED goals as MET
  if (existing.status !== GoalStatus.ACTIVE && existing.status !== GoalStatus.MODIFIED) {
    throw new Error('Can only mark active or modified goals as met');
  }

  // Update goal status
  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: {
      status: GoalStatus.MET,
      masteryDate: new Date(),
    },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
      dataPoints: {
        orderBy: { date: 'desc' },
        take: 10,
      },
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'MARK_GOAL_MET',
    resource: 'goal',
    resourceId: goalId,
    organizationId: user.organizationId!,
    details: {
      previousStatus: existing.status,
      masteryDate: updated.masteryDate,
    },
  });

  return updated;
}

/**
 * Calculate goal progress based on data points
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function calculateGoalProgress(goalId: string, user: JwtPayload): Promise<GoalProgressData> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
      dataPoints: {
        orderBy: { date: 'asc' },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  // Multi-tenancy check
  if (goal.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Goal belongs to different organization');
  }

  // RBAC: Patients can only view their own goal progress
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || goal.treatmentPlan.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own goal progress');
    }
  }

  // Calculate progress metrics
  const dataPoints = goal.dataPoints;

  if (dataPoints.length === 0) {
    return {
      goal,
      progress: {
        totalDataPoints: 0,
        firstValue: null,
        latestValue: null,
        averageValue: null,
        trend: 'NO_DATA',
        percentageChange: null,
      },
    };
  }

  const firstValue = dataPoints[0].value;
  const latestValue = dataPoints[dataPoints.length - 1].value;
  const averageValue =
    dataPoints.reduce((sum, dp) => sum + dp.value, 0) / dataPoints.length;

  // Calculate trend (simple: is it improving?)
  const baselineValue = (goal.baseline as any)?.value || firstValue;
  const percentageChange = ((latestValue - baselineValue) / baselineValue) * 100;

  let trend: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'NO_DATA' = 'STABLE';
  if (percentageChange > 10) trend = 'IMPROVING';
  else if (percentageChange < -10) trend = 'DECLINING';

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'CALCULATE_GOAL_PROGRESS',
    resource: 'goal',
    resourceId: goalId,
    organizationId: user.organizationId!,
  });

  return {
    goal,
    progress: {
      totalDataPoints: dataPoints.length,
      firstValue,
      latestValue,
      averageValue: Math.round(averageValue * 100) / 100,
      trend,
      percentageChange: Math.round(percentageChange * 100) / 100,
    },
  };
}
