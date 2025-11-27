/**
 * Treatment Plan Service
 *
 * Business logic for managing ABA treatment plans
 * HIPAA Compliance: All operations are audited
 */

import { TreatmentPlanStatus, Role } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CreateTreatmentPlanInput {
  patientId: string;
  authorizationId?: string;
  title: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  reviewDate: Date;
  status?: TreatmentPlanStatus;
}

export interface UpdateTreatmentPlanInput {
  title?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  reviewDate?: Date;
}

export interface GetAllTreatmentPlansFilters {
  page?: number;
  limit?: number;
  patientId?: string;
  status?: TreatmentPlanStatus;
  createdByUserId?: string;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new treatment plan
 * RBAC: ADMIN and PRACTITIONER (BCBA) only
 */
export async function createTreatmentPlan(
  input: CreateTreatmentPlanInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can create treatment plans
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can create treatment plans');
  }

  // Multi-tenancy: Verify patient belongs to user's organization
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  if (patient.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Cannot create treatment plan for patient in different organization');
  }

  // Verify authorization if provided
  if (input.authorizationId) {
    const authorization = await prisma.authorization.findUnique({
      where: { id: input.authorizationId },
    });

    if (!authorization) {
      throw new Error('Authorization not found');
    }

    if (authorization.organizationId !== user.organizationId) {
      throw new Error('Forbidden: Authorization belongs to different organization');
    }

    if (authorization.patientId !== input.patientId) {
      throw new Error('Authorization does not belong to the specified patient');
    }
  }

  // Date validation
  if (input.endDate && input.endDate <= input.startDate) {
    throw new Error('End date must be after start date');
  }

  if (input.reviewDate <= input.startDate) {
    throw new Error('Review date must be after start date');
  }

  // Create treatment plan
  const treatmentPlan = await prisma.treatmentPlan.create({
    data: {
      organizationId: user.organizationId!,
      patientId: input.patientId,
      authorizationId: input.authorizationId,
      createdByUserId: user.userId,
      title: input.title,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      reviewDate: input.reviewDate,
      status: input.status || TreatmentPlanStatus.DRAFT,
    },
    include: {
      patient: true,
      createdBy: true,
      authorization: true,
      goals: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'CREATE_TREATMENT_PLAN',
    resource: 'treatmentPlan',
    resourceId: treatmentPlan.id,
    organizationId: user.organizationId!,
    details: {
      patientId: input.patientId,
      title: input.title,
      status: treatmentPlan.status,
    },
  });

  return treatmentPlan;
}

/**
 * Get treatment plan by ID
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getTreatmentPlanById(
  treatmentPlanId: string,
  user: JwtPayload
) {
  const treatmentPlan = await prisma.treatmentPlan.findUnique({
    where: { id: treatmentPlanId },
    include: {
      patient: true,
      createdBy: true,
      authorization: true,
      goals: {
        include: {
          dataPoints: {
            orderBy: { date: 'desc' },
            take: 10, // Latest 10 data points per goal
          },
        },
      },
      progressNotes: {
        orderBy: { createdAt: 'desc' },
        take: 5, // Latest 5 progress notes
        include: {
          createdBy: true,
        },
      },
    },
  });

  if (!treatmentPlan) {
    throw new Error('Treatment plan not found');
  }

  // Multi-tenancy check
  if (treatmentPlan.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Treatment plan belongs to different organization');
  }

  // RBAC: Patients can only view their own treatment plans
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || treatmentPlan.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own treatment plans');
    }
  }

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_TREATMENT_PLAN',
    resource: 'treatmentPlan',
    resourceId: treatmentPlan.id,
    organizationId: user.organizationId!,
  });

  return treatmentPlan;
}

/**
 * Get all treatment plans with pagination and filtering
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getAllTreatmentPlans(
  user: JwtPayload,
  filters: GetAllTreatmentPlansFilters = {}
) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {
    organizationId: user.organizationId!,
  };

  // RBAC: Patients can only see their own treatment plans
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient) {
      throw new Error('Patient profile not found');
    }

    where.patientId = patient.id;
  } else {
    // ADMIN and PRACTITIONER can filter by patient
    if (filters.patientId) {
      where.patientId = filters.patientId;
    }
  }

  // Status filter
  if (filters.status) {
    where.status = filters.status;
  }

  // Created by filter (ADMIN only)
  if (filters.createdByUserId && user.role === Role.ADMIN) {
    where.createdByUserId = filters.createdByUserId;
  }

  const [treatmentPlans, total] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
        createdBy: true,
        authorization: true,
        goals: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    }),
    prisma.treatmentPlan.count({ where }),
  ]);

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_TREATMENT_PLAN',
    resource: 'treatmentPlan',
    organizationId: user.organizationId!,
    details: {
      filters,
      resultCount: treatmentPlans.length,
    },
  });

  return {
    treatmentPlans,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Update treatment plan
 * RBAC: ADMIN and PRACTITIONER (BCBA) only
 */
export async function updateTreatmentPlan(
  treatmentPlanId: string,
  input: UpdateTreatmentPlanInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can update treatment plans
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can update treatment plans');
  }

  // Fetch existing treatment plan
  const existing = await prisma.treatmentPlan.findUnique({
    where: { id: treatmentPlanId },
  });

  if (!existing) {
    throw new Error('Treatment plan not found');
  }

  // Multi-tenancy check
  if (existing.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Treatment plan belongs to different organization');
  }

  // Cannot update completed or discontinued plans
  if (
    existing.status === TreatmentPlanStatus.COMPLETED ||
    existing.status === TreatmentPlanStatus.DISCONTINUED
  ) {
    throw new Error('Cannot update completed or discontinued treatment plans');
  }

  // Date validation
  const startDate = input.startDate || existing.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
  const reviewDate = input.reviewDate || existing.reviewDate;

  if (endDate && endDate <= startDate) {
    throw new Error('End date must be after start date');
  }

  if (reviewDate <= startDate) {
    throw new Error('Review date must be after start date');
  }

  // Update treatment plan
  const updated = await prisma.treatmentPlan.update({
    where: { id: treatmentPlanId },
    data: {
      title: input.title,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      reviewDate: input.reviewDate,
    },
    include: {
      patient: true,
      createdBy: true,
      authorization: true,
      goals: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'UPDATE_TREATMENT_PLAN',
    resource: 'treatmentPlan',
    resourceId: treatmentPlanId,
    organizationId: user.organizationId!,
    details: {
      changes: input,
    },
  });

  return updated;
}

/**
 * Update treatment plan status
 * RBAC: ADMIN and PRACTITIONER (BCBA) only
 */
export async function updateTreatmentPlanStatus(
  treatmentPlanId: string,
  newStatus: TreatmentPlanStatus,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can update status
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can update treatment plan status');
  }

  // Fetch existing treatment plan
  const existing = await prisma.treatmentPlan.findUnique({
    where: { id: treatmentPlanId },
  });

  if (!existing) {
    throw new Error('Treatment plan not found');
  }

  // Multi-tenancy check
  if (existing.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Treatment plan belongs to different organization');
  }

  // Status transition validation
  const validTransitions: Record<TreatmentPlanStatus, TreatmentPlanStatus[]> = {
    [TreatmentPlanStatus.DRAFT]: [
      TreatmentPlanStatus.ACTIVE,
      TreatmentPlanStatus.DISCONTINUED,
    ],
    [TreatmentPlanStatus.ACTIVE]: [
      TreatmentPlanStatus.UNDER_REVIEW,
      TreatmentPlanStatus.COMPLETED,
      TreatmentPlanStatus.DISCONTINUED,
    ],
    [TreatmentPlanStatus.UNDER_REVIEW]: [
      TreatmentPlanStatus.ACTIVE,
      TreatmentPlanStatus.DISCONTINUED,
    ],
    [TreatmentPlanStatus.COMPLETED]: [], // Terminal state
    [TreatmentPlanStatus.DISCONTINUED]: [], // Terminal state
  };

  const allowedStatuses = validTransitions[existing.status as TreatmentPlanStatus];
  if (!allowedStatuses || !allowedStatuses.includes(newStatus)) {
    throw new Error(
      `Invalid status transition from ${existing.status} to ${newStatus}`
    );
  }

  // Update status
  const updated = await prisma.treatmentPlan.update({
    where: { id: treatmentPlanId },
    data: { status: newStatus },
    include: {
      patient: true,
      createdBy: true,
      authorization: true,
      goals: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'UPDATE_TREATMENT_PLAN_STATUS',
    resource: 'treatmentPlan',
    resourceId: treatmentPlanId,
    organizationId: user.organizationId!,
    details: {
      oldStatus: existing.status,
      newStatus,
    },
  });

  return updated;
}

/**
 * Get treatment plans by patient ID
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getTreatmentPlansByPatient(
  patientId: string,
  user: JwtPayload
) {
  // Verify patient exists and belongs to organization
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  if (patient.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Patient belongs to different organization');
  }

  // RBAC: Patients can only view their own treatment plans
  if (user.role === Role.PATIENT) {
    const userPatient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!userPatient || userPatient.id !== patientId) {
      throw new Error('Forbidden: Patients can only view their own treatment plans');
    }
  }

  const treatmentPlans = await prisma.treatmentPlan.findMany({
    where: {
      patientId,
      organizationId: user.organizationId!,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: true,
      authorization: true,
      goals: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_TREATMENT_PLAN',
    resource: 'treatmentPlan',
    organizationId: user.organizationId!,
    details: {
      patientId,
      resultCount: treatmentPlans.length,
    },
  });

  return treatmentPlans;
}
