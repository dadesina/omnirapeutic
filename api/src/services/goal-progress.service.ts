/**
 * Goal Progress Service
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * Manages progress tracking for treatment goals, including progress history,
 * percentage calculation, and visualization data generation.
 */

import { Role, VisualizationType } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';
import { validateGoalProgressHistory } from '../utils/phase7b2-validation';
import type {
  GoalProgressHistory,
  GoalProgressHistoryEntry,
} from '../types/phase7b2.types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface UpdateGoalProgressInput {
  progressPercentage: number;
  notes?: string;
  method?: 'manual' | 'automated' | 'calculated';
  sessionId?: string;
  milestoneId?: string;
}

export interface GetProgressHistoryOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface ProgressVisualizationData {
  goalId: string;
  currentProgress: number;
  visualizationType: VisualizationType;
  history: {
    timestamp: string;
    value: number;
    notes?: string;
  }[];
  milestones: {
    id: string;
    description: string;
    targetDate?: Date;
    achievedAt?: Date;
  }[];
  statistics: {
    averageProgress: number;
    progressVelocity: number; // Progress per day
    estimatedCompletionDate?: Date;
    daysToCompletion?: number;
  };
}

// ============================================================================
// UPDATE PROGRESS
// ============================================================================

/**
 * Update goal progress percentage and record in history
 * RBAC: ADMIN, PRACTITIONER
 */
export async function updateGoalProgress(
  goalId: string,
  input: UpdateGoalProgressInput,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can update goal progress'
    );
  }

  // 2. Verify goal exists and belongs to organization
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              organizationId: true,
            },
          },
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const goalOrganizationId = goal.treatmentPlan.patient.organizationId;

  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This goal belongs to a different organization'
    );
  }

  // 3. Validate progress percentage
  if (
    input.progressPercentage < 0 ||
    input.progressPercentage > 100 ||
    !Number.isInteger(input.progressPercentage)
  ) {
    throw new Error('Progress percentage must be an integer between 0 and 100');
  }

  // 4. Validate sessionId if provided
  if (input.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.organizationId !== user.organizationId) {
      throw new Error('Session belongs to a different organization');
    }
  }

  // 5. Validate milestoneId if provided
  if (input.milestoneId) {
    const milestone = await prisma.goalMilestone.findUnique({
      where: { id: input.milestoneId },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.goalId !== goalId) {
      throw new Error('Milestone does not belong to this goal');
    }
  }

  // 6. Get existing progress history
  const existingHistory = (goal.progressHistory as unknown as GoalProgressHistory) || [];

  // 7. Create new progress entry
  const newEntry: GoalProgressHistoryEntry = {
    timestamp: new Date().toISOString(),
    value: input.progressPercentage,
    notes: input.notes,
    recordedBy: user.userId,
    sessionId: input.sessionId,
    milestoneId: input.milestoneId,
    method: input.method || 'manual',
  };

  // 8. Append to history
  const updatedHistory = [...existingHistory, newEntry];

  // 9. Validate complete history
  const validation = validateGoalProgressHistory(updatedHistory);
  if (!validation.valid) {
    throw new Error(`Invalid progress history: ${validation.errors.join(', ')}`);
  }

  // 10. Update goal
  const updatedGoal = await prisma.goal.update({
    where: { id: goalId },
    data: {
      progressPercentage: input.progressPercentage,
      progressHistory: updatedHistory as any,
    },
  });

  // 11. Audit log
  await logAuditEvent({
    action: 'UPDATE',
    resource: 'goals',
    resourceId: goalId,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      type: 'progress_update',
      oldProgress: goal.progressPercentage,
      newProgress: input.progressPercentage,
      method: input.method || 'manual',
      sessionId: input.sessionId,
      milestoneId: input.milestoneId,
    },
  });

  return updatedGoal;
}

/**
 * Calculate progress automatically based on milestone completion
 * RBAC: ADMIN, PRACTITIONER
 */
export async function calculateProgressFromMilestones(
  goalId: string,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can calculate goal progress'
    );
  }

  // 2. Verify goal exists and belongs to organization
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              organizationId: true,
            },
          },
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const goalOrganizationId = goal.treatmentPlan.patient.organizationId;

  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This goal belongs to a different organization'
    );
  }

  // 3. Get all milestones for the goal
  const milestones = await prisma.goalMilestone.findMany({
    where: { goalId },
  });

  if (milestones.length === 0) {
    throw new Error(
      'Cannot calculate progress: Goal has no milestones defined'
    );
  }

  // 4. Calculate progress percentage
  const achievedMilestones = milestones.filter((m) => m.achievedAt).length;
  const totalMilestones = milestones.length;
  const progressPercentage = Math.round(
    (achievedMilestones / totalMilestones) * 100
  );

  // 5. Update progress
  return updateGoalProgress(
    goalId,
    {
      progressPercentage,
      notes: `Auto-calculated from milestones: ${achievedMilestones}/${totalMilestones} completed`,
      method: 'calculated',
    },
    user
  );
}

// ============================================================================
// READ PROGRESS
// ============================================================================

/**
 * Get progress history for a goal
 * RBAC: ADMIN, practitioners, or patient/caregiver if it's their own goal
 */
export async function getGoalProgressHistory(
  goalId: string,
  options: GetProgressHistoryOptions,
  user: JwtPayload
) {
  // 1. Verify goal exists and get organization
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              userId: true,
              organizationId: true,
            },
          },
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const goalOrganizationId = goal.treatmentPlan.patient.organizationId;
  const patientUserId = goal.treatmentPlan.patient.userId;

  // 2. Multi-tenant isolation check
  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This goal belongs to a different organization'
    );
  }

  // 3. RBAC check - Patients/caregivers can only view their own goals
  if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
    if (patientUserId !== user.userId) {
      throw new Error(
        'Forbidden: You can only view progress for your own goals'
      );
    }
  }

  // 4. Get progress history
  let history = (goal.progressHistory as unknown as GoalProgressHistory) || [];

  // 5. Filter by date range if provided
  if (options.startDate || options.endDate) {
    history = history.filter((entry) => {
      const entryDate = new Date(entry.timestamp);
      if (options.startDate && entryDate < options.startDate) return false;
      if (options.endDate && entryDate > options.endDate) return false;
      return true;
    });
  }

  // 6. Limit results if requested
  if (options.limit && options.limit > 0) {
    // Get most recent entries
    history = history.slice(-options.limit);
  }

  return {
    goalId,
    currentProgress: goal.progressPercentage,
    history,
    totalEntries: history.length,
  };
}

// ============================================================================
// VISUALIZATION
// ============================================================================

/**
 * Get visualization data for a goal's progress
 * RBAC: ADMIN, practitioners, or patient/caregiver if it's their own goal
 */
export async function getProgressVisualizationData(
  goalId: string,
  user: JwtPayload
): Promise<ProgressVisualizationData> {
  // 1. Verify goal exists and get full data
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              userId: true,
              organizationId: true,
            },
          },
        },
      },
      milestones: {
        orderBy: {
          targetDate: 'asc',
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const goalOrganizationId = goal.treatmentPlan.patient.organizationId;
  const patientUserId = goal.treatmentPlan.patient.userId;

  // 2. Multi-tenant isolation check
  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This goal belongs to a different organization'
    );
  }

  // 3. RBAC check
  if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
    if (patientUserId !== user.userId) {
      throw new Error(
        'Forbidden: You can only view progress visualization for your own goals'
      );
    }
  }

  // 4. Get progress history
  const history = (goal.progressHistory as unknown as GoalProgressHistory) || [];

  // 5. Format history for visualization
  const formattedHistory = history.map((entry) => ({
    timestamp: entry.timestamp,
    value: entry.value,
    notes: entry.notes,
  }));

  // 6. Calculate statistics
  const statistics = calculateProgressStatistics(history);

  // 7. Format milestones
  const formattedMilestones = goal.milestones.map((m) => ({
    id: m.id,
    description: m.description,
    targetDate: m.targetDate || undefined,
    achievedAt: m.achievedAt || undefined,
  }));

  return {
    goalId,
    currentProgress: goal.progressPercentage,
    visualizationType: goal.visualizationType,
    history: formattedHistory,
    milestones: formattedMilestones,
    statistics,
  };
}

/**
 * Update goal visualization type
 * RBAC: ADMIN, PRACTITIONER
 */
export async function updateVisualizationType(
  goalId: string,
  visualizationType: VisualizationType,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can update visualization type'
    );
  }

  // 2. Verify goal exists and belongs to organization
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              organizationId: true,
            },
          },
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const goalOrganizationId = goal.treatmentPlan.patient.organizationId;

  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This goal belongs to a different organization'
    );
  }

  // 3. Update visualization type
  const updatedGoal = await prisma.goal.update({
    where: { id: goalId },
    data: {
      visualizationType,
    },
  });

  // 4. Audit log
  await logAuditEvent({
    action: 'UPDATE',
    resource: 'goals',
    resourceId: goalId,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      type: 'visualization_type_update',
      oldType: goal.visualizationType,
      newType: visualizationType,
    },
  });

  return updatedGoal;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate progress statistics from history
 */
function calculateProgressStatistics(
  history: GoalProgressHistory
): ProgressVisualizationData['statistics'] {
  if (history.length === 0) {
    return {
      averageProgress: 0,
      progressVelocity: 0,
      estimatedCompletionDate: undefined,
      daysToCompletion: undefined,
    };
  }

  // Calculate average progress
  const totalProgress = history.reduce((sum, entry) => sum + entry.value, 0);
  const averageProgress = Math.round(totalProgress / history.length);

  // Calculate progress velocity (progress per day)
  let progressVelocity = 0;
  let estimatedCompletionDate: Date | undefined;
  let daysToCompletion: number | undefined;

  if (history.length >= 2) {
    const firstEntry = history[0];
    const lastEntry = history[history.length - 1];

    const firstDate = new Date(firstEntry.timestamp);
    const lastDate = new Date(lastEntry.timestamp);

    const daysDiff =
      (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 0) {
      const progressDiff = lastEntry.value - firstEntry.value;
      progressVelocity = parseFloat((progressDiff / daysDiff).toFixed(2));

      // Estimate completion date if progress velocity is positive
      if (progressVelocity > 0 && lastEntry.value < 100) {
        const remainingProgress = 100 - lastEntry.value;
        const daysRemaining = Math.ceil(remainingProgress / progressVelocity);

        daysToCompletion = daysRemaining;

        const completionDate = new Date(lastDate);
        completionDate.setDate(completionDate.getDate() + daysRemaining);
        estimatedCompletionDate = completionDate;
      }
    }
  }

  return {
    averageProgress,
    progressVelocity,
    estimatedCompletionDate,
    daysToCompletion,
  };
}

/**
 * Get progress summary for multiple goals
 * RBAC: ADMIN, practitioners, or patient/caregiver for their own goals
 */
export async function getGoalProgressSummary(
  goalIds: string[],
  user: JwtPayload
) {
  // Fetch all goals
  const goals = await prisma.goal.findMany({
    where: {
      id: { in: goalIds },
    },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              userId: true,
              organizationId: true,
            },
          },
        },
      },
      milestones: true,
    },
  });

  // Filter and validate access
  const summaries = [];

  for (const goal of goals) {
    const goalOrganizationId = goal.treatmentPlan.patient.organizationId;
    const patientUserId = goal.treatmentPlan.patient.userId;

    // Skip goals from other organizations
    if (goalOrganizationId !== user.organizationId) {
      continue;
    }

    // Skip goals not owned by patient/caregiver
    if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
      if (patientUserId !== user.userId) {
        continue;
      }
    }

    const history = (goal.progressHistory as unknown as GoalProgressHistory) || [];
    const lastUpdate =
      history.length > 0 ? new Date(history[history.length - 1].timestamp) : null;

    const totalMilestones = goal.milestones.length;
    const achievedMilestones = goal.milestones.filter((m) => m.achievedAt).length;

    summaries.push({
      goalId: goal.id,
      description: goal.description,
      currentProgress: goal.progressPercentage,
      lastUpdated: lastUpdate,
      totalMilestones,
      achievedMilestones,
      status: goal.status,
    });
  }

  return summaries;
}
