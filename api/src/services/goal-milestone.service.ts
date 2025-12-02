/**
 * Goal Milestone Service
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * Manages milestones for treatment goals, allowing practitioners to break down
 * long-term goals into achievable checkpoints for tracking progress.
 */

import { Role } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateGoalMilestoneInput {
  description: string;
  targetDate?: Date;
}

export interface UpdateGoalMilestoneInput {
  description?: string;
  targetDate?: Date | null;
  achievedAt?: Date | null;
}

// ============================================================================
// CREATE MILESTONE
// ============================================================================

/**
 * Create a milestone for a specific goal
 * RBAC: ADMIN, PRACTITIONER (who can manage goals)
 */
export async function createGoalMilestone(
  goalId: string,
  input: CreateGoalMilestoneInput,
  user: JwtPayload
) {
  // 1. RBAC check - Only ADMIN and PRACTITIONER can create milestones
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can create goal milestones'
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

  // 3. Validate input
  if (!input.description || input.description.trim().length === 0) {
    throw new Error('Milestone description is required');
  }

  if (input.description.length > 500) {
    throw new Error('Milestone description must not exceed 500 characters');
  }

  // 4. Create milestone
  const milestone = await prisma.goalMilestone.create({
    data: {
      goalId,
      description: input.description.trim(),
      targetDate: input.targetDate,
    },
  });

  // 5. Audit log
  await logAuditEvent({
    action: 'CREATE',
    resource: 'goal_milestones',
    resourceId: milestone.id,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      goalId,
      description: milestone.description,
      targetDate: milestone.targetDate,
    },
  });

  return milestone;
}

// ============================================================================
// READ MILESTONES
// ============================================================================

/**
 * Get all milestones for a specific goal
 * RBAC: ADMIN, practitioners, or patient/caregiver if it's their own goal
 */
export async function getGoalMilestones(goalId: string, user: JwtPayload) {
  // 1. Verify goal exists and get organization
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        select: {
          patient: {
            select: {
              id: true,
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
        'Forbidden: You can only view milestones for your own goals'
      );
    }
  }

  // 4. Query milestones
  const milestones = await prisma.goalMilestone.findMany({
    where: { goalId },
    orderBy: [
      { targetDate: 'asc' }, // Earliest target date first
      { createdAt: 'asc' }, // Then by creation order
    ],
  });

  return milestones;
}

/**
 * Get a single milestone by ID
 * RBAC: ADMIN, practitioners, or patient/caregiver if it's their own goal
 */
export async function getGoalMilestone(
  milestoneId: string,
  user: JwtPayload
) {
  // 1. Query milestone with goal relationship
  const milestone = await prisma.goalMilestone.findUnique({
    where: { id: milestoneId },
    include: {
      goal: {
        include: {
          treatmentPlan: {
            select: {
              patient: {
                select: {
                  id: true,
                  userId: true,
                  organizationId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  const goalOrganizationId =
    milestone.goal.treatmentPlan.patient.organizationId;
  const patientUserId = milestone.goal.treatmentPlan.patient.userId;

  // 2. Multi-tenant isolation check
  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This milestone belongs to a different organization'
    );
  }

  // 3. RBAC check - Patients/caregivers can only view their own goals
  if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
    if (patientUserId !== user.userId) {
      throw new Error(
        'Forbidden: You can only view milestones for your own goals'
      );
    }
  }

  // 4. Return milestone without nested goal to avoid circular data
  const { goal, ...milestoneData } = milestone;

  return {
    ...milestoneData,
    goalId: goal.id,
  };
}

// ============================================================================
// UPDATE MILESTONE
// ============================================================================

/**
 * Update an existing milestone
 * RBAC: ADMIN, PRACTITIONER
 */
export async function updateGoalMilestone(
  milestoneId: string,
  input: UpdateGoalMilestoneInput,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can update goal milestones'
    );
  }

  // 2. Verify milestone exists
  const existingMilestone = await prisma.goalMilestone.findUnique({
    where: { id: milestoneId },
    include: {
      goal: {
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
      },
    },
  });

  if (!existingMilestone) {
    throw new Error('Milestone not found');
  }

  const goalOrganizationId =
    existingMilestone.goal.treatmentPlan.patient.organizationId;

  // 3. Multi-tenant isolation check
  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This milestone belongs to a different organization'
    );
  }

  // 4. Validate input
  if (
    input.description !== undefined &&
    input.description.trim().length === 0
  ) {
    throw new Error('Milestone description cannot be empty');
  }

  if (input.description && input.description.length > 500) {
    throw new Error('Milestone description must not exceed 500 characters');
  }

  // 5. Build update data
  const updateData: any = {};

  if (input.description !== undefined) {
    updateData.description = input.description.trim();
  }

  if (input.targetDate !== undefined) {
    updateData.targetDate = input.targetDate;
  }

  if (input.achievedAt !== undefined) {
    updateData.achievedAt = input.achievedAt;
  }

  // 6. Update milestone
  const updatedMilestone = await prisma.goalMilestone.update({
    where: { id: milestoneId },
    data: updateData,
  });

  // 7. Audit log
  await logAuditEvent({
    action: 'UPDATE',
    resource: 'goal_milestones',
    resourceId: milestoneId,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      goalId: existingMilestone.goalId,
      changes: Object.keys(updateData),
      achievedAt: updatedMilestone.achievedAt,
    },
  });

  return updatedMilestone;
}

/**
 * Mark a milestone as achieved
 * RBAC: ADMIN, PRACTITIONER
 */
export async function achieveMilestone(milestoneId: string, user: JwtPayload) {
  return updateGoalMilestone(
    milestoneId,
    { achievedAt: new Date() },
    user
  );
}

/**
 * Unmark a milestone as achieved (e.g., if marked by mistake)
 * RBAC: ADMIN, PRACTITIONER
 */
export async function unachieveMilestone(
  milestoneId: string,
  user: JwtPayload
) {
  return updateGoalMilestone(milestoneId, { achievedAt: null }, user);
}

// ============================================================================
// DELETE MILESTONE
// ============================================================================

/**
 * Delete a milestone
 * RBAC: ADMIN, PRACTITIONER
 */
export async function deleteGoalMilestone(
  milestoneId: string,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can delete goal milestones'
    );
  }

  // 2. Verify milestone exists
  const milestone = await prisma.goalMilestone.findUnique({
    where: { id: milestoneId },
    include: {
      goal: {
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
      },
    },
  });

  if (!milestone) {
    throw new Error('Milestone not found');
  }

  const goalOrganizationId = milestone.goal.treatmentPlan.patient.organizationId;

  // 3. Multi-tenant isolation check
  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This milestone belongs to a different organization'
    );
  }

  // 4. Delete milestone
  await prisma.goalMilestone.delete({
    where: { id: milestoneId },
  });

  // 5. Audit log
  await logAuditEvent({
    action: 'DELETE',
    resource: 'goal_milestones',
    resourceId: milestoneId,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      goalId: milestone.goalId,
      description: milestone.description,
      wasAchieved: !!milestone.achievedAt,
    },
  });

  return { success: true, message: 'Milestone deleted successfully' };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get milestone statistics for a goal
 */
export async function getGoalMilestoneStats(
  goalId: string,
  user: JwtPayload
) {
  // Verify access
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

  if (goalOrganizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This goal belongs to a different organization'
    );
  }

  if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
    if (patientUserId !== user.userId) {
      throw new Error(
        'Forbidden: You can only view statistics for your own goals'
      );
    }
  }

  // Get all milestones for goal
  const milestones = await prisma.goalMilestone.findMany({
    where: { goalId },
  });

  const totalMilestones = milestones.length;
  const achievedMilestones = milestones.filter((m) => m.achievedAt).length;
  const pendingMilestones = totalMilestones - achievedMilestones;

  const now = new Date();
  const overdueMilestones = milestones.filter(
    (m) => !m.achievedAt && m.targetDate && m.targetDate < now
  ).length;

  const upcomingMilestones = milestones.filter(
    (m) => !m.achievedAt && m.targetDate && m.targetDate >= now
  ).length;

  const nextMilestone = milestones
    .filter((m) => !m.achievedAt && m.targetDate)
    .sort((a, b) => {
      if (!a.targetDate || !b.targetDate) return 0;
      return a.targetDate.getTime() - b.targetDate.getTime();
    })[0];

  const completionRate =
    totalMilestones > 0
      ? Math.round((achievedMilestones / totalMilestones) * 100)
      : 0;

  return {
    totalMilestones,
    achievedMilestones,
    pendingMilestones,
    overdueMilestones,
    upcomingMilestones,
    completionRate,
    nextMilestone: nextMilestone
      ? {
          id: nextMilestone.id,
          description: nextMilestone.description,
          targetDate: nextMilestone.targetDate,
        }
      : null,
  };
}
