/**
 * Progress Note Service
 *
 * Business logic for managing clinical progress notes
 * HIPAA Compliance: All operations are audited, notes have 24-hour edit window
 */

import { Role } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CreateProgressNoteInput {
  sessionId: string;
  treatmentPlanId?: string;
  narrative: string;
  behaviorObservations?: string;
  interventionsUsed?: string;
  recommendedAdjustments?: string;
}

export interface UpdateProgressNoteInput {
  narrative?: string;
  behaviorObservations?: string;
  interventionsUsed?: string;
  recommendedAdjustments?: string;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a progress note for a session
 * RBAC: ADMIN and PRACTITIONER only
 */
export async function createProgressNote(
  input: CreateProgressNoteInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can create progress notes
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can create progress notes');
  }

  // Verify session exists and belongs to user's organization
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: {
      patient: true,
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Session belongs to different organization');
  }

  // Check if progress note already exists for this session
  const existing = await prisma.progressNote.findUnique({
    where: { sessionId: input.sessionId },
  });

  if (existing) {
    throw new Error('Progress note already exists for this session');
  }

  // Verify treatment plan if provided
  if (input.treatmentPlanId) {
    const treatmentPlan = await prisma.treatmentPlan.findUnique({
      where: { id: input.treatmentPlanId },
    });

    if (!treatmentPlan) {
      throw new Error('Treatment plan not found');
    }

    if (treatmentPlan.organizationId !== user.organizationId) {
      throw new Error('Forbidden: Treatment plan belongs to different organization');
    }

    if (treatmentPlan.patientId !== session.patientId) {
      throw new Error('Treatment plan does not belong to the session patient');
    }
  }

  // Create progress note
  const progressNote = await prisma.progressNote.create({
    data: {
      sessionId: input.sessionId,
      organizationId: user.organizationId!,
      createdByUserId: user.userId,
      treatmentPlanId: input.treatmentPlanId,
      narrative: input.narrative,
      behaviorObservations: input.behaviorObservations,
      interventionsUsed: input.interventionsUsed,
      recommendedAdjustments: input.recommendedAdjustments,
    },
    include: {
      session: {
        include: {
          patient: true,
          practitioner: true,
        },
      },
      treatmentPlan: true,
      createdBy: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'CREATE_PROGRESS_NOTE',
    resource: 'progressNote',
    resourceId: progressNote.id,
    organizationId: user.organizationId!,
    details: {
      sessionId: input.sessionId,
      treatmentPlanId: input.treatmentPlanId,
    },
  });

  return progressNote;
}

/**
 * Get progress note by session ID
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getProgressNoteBySession(
  sessionId: string,
  user: JwtPayload
) {
  // Verify session exists
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Session belongs to different organization');
  }

  // RBAC: Patients can only view their own progress notes
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || session.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own progress notes');
    }
  }

  const progressNote = await prisma.progressNote.findUnique({
    where: { sessionId },
    include: {
      session: {
        include: {
          patient: true,
          practitioner: true,
        },
      },
      treatmentPlan: true,
      createdBy: true,
      dataPoints: {
        include: {
          goal: true,
        },
      },
    },
  });

  if (!progressNote) {
    throw new Error('Progress note not found for this session');
  }

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_PROGRESS_NOTE',
    resource: 'progressNote',
    resourceId: progressNote.id,
    organizationId: user.organizationId!,
  });

  return progressNote;
}

/**
 * Update progress note
 * RBAC: ADMIN and PRACTITIONER only
 * HIPAA: 24-hour edit window enforcement
 */
export async function updateProgressNote(
  progressNoteId: string,
  input: UpdateProgressNoteInput,
  user: JwtPayload
) {
  // RBAC: Only ADMIN and PRACTITIONER can update progress notes
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can update progress notes');
  }

  // Fetch existing progress note
  const existing = await prisma.progressNote.findUnique({
    where: { id: progressNoteId },
  });

  if (!existing) {
    throw new Error('Progress note not found');
  }

  // Multi-tenancy check
  if (existing.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Progress note belongs to different organization');
  }

  // 24-hour edit window enforcement
  const now = new Date();
  const createdAt = new Date(existing.createdAt);
  const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceCreation > 24) {
    throw new Error(
      'Progress notes can only be edited within 24 hours of creation (HIPAA compliance)'
    );
  }

  // Update progress note
  const updated = await prisma.progressNote.update({
    where: { id: progressNoteId },
    data: {
      narrative: input.narrative,
      behaviorObservations: input.behaviorObservations,
      interventionsUsed: input.interventionsUsed,
      recommendedAdjustments: input.recommendedAdjustments,
    },
    include: {
      session: {
        include: {
          patient: true,
          practitioner: true,
        },
      },
      treatmentPlan: true,
      createdBy: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'UPDATE_PROGRESS_NOTE',
    resource: 'progressNote',
    resourceId: progressNoteId,
    organizationId: user.organizationId!,
    details: {
      changes: input,
      hoursSinceCreation: Math.round(hoursSinceCreation * 100) / 100,
    },
  });

  return updated;
}

/**
 * Get progress notes by treatment plan
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getProgressNotesByTreatmentPlan(
  treatmentPlanId: string,
  user: JwtPayload,
  options: { page?: number; limit?: number } = {}
) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  // Verify treatment plan exists and user has access
  const treatmentPlan = await prisma.treatmentPlan.findUnique({
    where: { id: treatmentPlanId },
  });

  if (!treatmentPlan) {
    throw new Error('Treatment plan not found');
  }

  if (treatmentPlan.organizationId !== user.organizationId) {
    throw new Error('Forbidden: Treatment plan belongs to different organization');
  }

  // RBAC: Patients can only view their own progress notes
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient || treatmentPlan.patientId !== patient.id) {
      throw new Error('Forbidden: Patients can only view their own progress notes');
    }
  }

  const [progressNotes, total] = await Promise.all([
    prisma.progressNote.findMany({
      where: {
        treatmentPlanId,
        organizationId: user.organizationId!,
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        session: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            unitsUsed: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    }),
    prisma.progressNote.count({
      where: {
        treatmentPlanId,
        organizationId: user.organizationId!,
      },
    }),
  ]);

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'READ_PROGRESS_NOTE',
    resource: 'progressNote',
    organizationId: user.organizationId!,
    details: {
      treatmentPlanId,
      resultCount: progressNotes.length,
    },
  });

  return {
    progressNotes,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
