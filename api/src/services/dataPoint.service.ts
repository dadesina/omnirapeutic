/**
 * Data Point Service
 *
 * Business logic for managing data collection for goals
 * HIPAA Compliance: All operations are audited, data points are immutable once created
 */

import { Role } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CreateDataPointInput {
  goalId: string;
  progressNoteId?: string;
  sessionId?: string;
  value: number;
  unit: string;
  notes?: string;
  date?: Date;
}

export interface BulkCreateDataPointsInput {
  dataPoints: CreateDataPointInput[];
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a data point for a goal
 * RBAC: ADMIN and PRACTITIONER only
 * Note: Data points are immutable once created (no updates allowed)
 */
export async function createDataPoint(
  input: CreateDataPointInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can create data points
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can create data points');
  }

  // Verify goal exists and belongs to user's organization
  const goal = await prisma.goal.findUnique({
    where: { id: input.goalId },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  if (goal.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Goal belongs to different organization');
  }

  // Verify progress note if provided
  if (input.progressNoteId) {
    const progressNote = await prisma.progressNote.findUnique({
      where: { id: input.progressNoteId },
    });

    if (!progressNote) {
      throw new Error('Progress note not found');
    }

    if (progressNote.organizationId !== user.organizationId) {
      throw new Error('Forbidden: Progress note belongs to different organization');
    }
  }

  // Verify session if provided
  if (input.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.organizationId !== user.organizationId) {
      throw new Error('Forbidden: Session belongs to different organization');
    }
  }

  // Create data point
  const dataPoint = await prisma.dataPoint.create({
    data: {
      goalId: input.goalId,
      organizationId: user.organizationId!,
      progressNoteId: input.progressNoteId,
      sessionId: input.sessionId,
      value: input.value,
      unit: input.unit,
      notes: input.notes,
      date: input.date || new Date(),
    },
    include: {
      goal: {
        include: {
          treatmentPlan: true,
        },
      },
      progressNote: true,
      session: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'CREATE_DATA_POINT',
    resource: 'dataPoint',
    resourceId: dataPoint.id,
    organizationId: user.organizationId!,
    details: {
      goalId: input.goalId,
      value: input.value,
      unit: input.unit,
      date: dataPoint.date,
    },
  });

  return dataPoint;
}

/**
 * Bulk create data points (atomic transaction)
 * RBAC: ADMIN and PRACTITIONER only
 * All data points must succeed or none are created
 */
export async function bulkCreateDataPoints(
  input: BulkCreateDataPointsInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can create data points
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can create data points');
  }

  if (!input.dataPoints || input.dataPoints.length === 0) {
    throw new Error('No data points provided');
  }

  // Verify all goals exist and belong to user's organization
  const goalIds = [...new Set(input.dataPoints.map((dp) => dp.goalId))];
  const goals = await prisma.goal.findMany({
    where: {
      id: { in: goalIds },
    },
  });

  if (goals.length !== goalIds.length) {
    throw new Error('One or more goals not found');
  }

  const wrongOrgGoals = goals.filter((g) => g.organizationId !== user.organizationId);
  if (wrongOrgGoals.length > 0) {
    throw new Error('Forbidden: One or more goals belong to different organization');
  }

  // Create all data points in a transaction
  const dataPoints = await prisma.$transaction(
    input.dataPoints.map((dp) =>
      prisma.dataPoint.create({
        data: {
          goalId: dp.goalId,
          organizationId: user.organizationId!,
          progressNoteId: dp.progressNoteId,
          sessionId: dp.sessionId,
          value: dp.value,
          unit: dp.unit,
          notes: dp.notes,
          date: dp.date || new Date(),
        },
        include: {
          goal: true,
        },
      })
    )
  );

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'BULK_CREATE_DATA_POINTS',
    resource: 'dataPoint',
    organizationId: user.organizationId!,
    details: {
      count: dataPoints.length,
      goalIds,
    },
  });

  return dataPoints;
}

/**
 * Get data points by goal
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getDataPointsByGoal(
  goalId: string,
  user: JwtPayload,
  options: { page?: number; limit?: number; startDate?: Date; endDate?: Date } = {}
) {
  const page = options.page || 1;
  const limit = options.limit || 50;
  const skip = (page - 1) * limit;

  // Verify goal exists and user has access
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      treatmentPlan: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  if (goal.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Goal belongs to different organization');
  }

  // RBAC: Patients can only view their own data points
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || goal.treatmentPlan.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own data points');
    }
  }

  // Build date filter
  const dateFilter: any = {};
  if (options.startDate) {
    dateFilter.gte = options.startDate;
  }
  if (options.endDate) {
    dateFilter.lte = options.endDate;
  }

  const where: any = {
    goalId,
    organizationId: user.organizationId!,
  };

  if (Object.keys(dateFilter).length > 0) {
    where.date = dateFilter;
  }

  const [dataPoints, total] = await Promise.all([
    prisma.dataPoint.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        progressNote: {
          select: {
            id: true,
            sessionId: true,
          },
        },
        session: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    }),
    prisma.dataPoint.count({ where }),
  ]);

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_DATA_POINT',
    resource: 'dataPoint',
    organizationId: user.organizationId!,
    details: {
      goalId,
      resultCount: dataPoints.length,
      dateRange: { startDate: options.startDate, endDate: options.endDate },
    },
  });

  return {
    dataPoints,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get data points by session
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getDataPointsBySession(
  sessionId: string,
  user: JwtPayload
) {
  // Verify session exists and user has access
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Session belongs to different organization');
  }

  // RBAC: Patients can only view their own data points
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || session.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own data points');
    }
  }

  const dataPoints = await prisma.dataPoint.findMany({
    where: {
      sessionId,
      organizationId: user.organizationId!,
    },
    orderBy: { date: 'desc' },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          domain: true,
        },
      },
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_DATA_POINT',
    resource: 'dataPoint',
    organizationId: user.organizationId!,
    details: {
      sessionId,
      resultCount: dataPoints.length,
    },
  });

  return dataPoints;
}

/**
 * Delete a data point
 * RBAC: ADMIN only
 * Note: Data points should generally be immutable, but ADMIN can delete in case of errors
 */
export async function deleteDataPoint(dataPointId: string, user: JwtPayload) {
  // RBAC: Only ADMIN can delete data points
  if (user.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can delete data points');
  }

  // Fetch existing data point
  const existing = await prisma.dataPoint.findUnique({
    where: { id: dataPointId },
    include: {
      goal: {
        include: {
          treatmentPlan: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error('Data point not found');
  }

  // Multi-tenancy check
  if (existing.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Data point belongs to different organization');
  }

  // Delete data point
  await prisma.dataPoint.delete({
    where: { id: dataPointId },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'DELETE_DATA_POINT',
    resource: 'dataPoint',
    resourceId: dataPointId,
    organizationId: user.organizationId!,
    details: {
      goalId: existing.goalId,
      value: existing.value,
      unit: existing.unit,
      date: existing.date,
    },
  });

  return { message: 'Data point deleted successfully' };
}
