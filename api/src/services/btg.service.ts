/**
 * Break-the-Glass (BTG) Service
 *
 * Implements emergency access procedures for HIPAA compliance
 * § 164.308(a)(4)(ii)(C) - Emergency Access Procedure
 *
 * Provides time-bound, audited emergency access to patient records
 */

import prisma from '../config/database';
import { Role } from '@prisma/client';
import { JwtPayload } from './auth.service';
import { logAuditEvent } from './audit.service';

// Predefined duration options (in minutes)
export const ALLOWED_DURATIONS = [30, 60, 120, 240, 480] as const;
export type AllowedDuration = typeof ALLOWED_DURATIONS[number];

export interface CreateBtgGrantRequest {
  grantedToUserId: string;
  patientId: string;
  justification: string;
  durationMinutes: AllowedDuration;
}

export interface BtgGrantResponse {
  success: boolean;
  grantId: string;
  expiresAt: Date;
  message: string;
}

export interface BtgGrant {
  id: string;
  grantedByUserId: string;
  grantedToUserId: string;
  patientId: string;
  justification: string;
  durationMinutes: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  grantedByUser: {
    email: string;
  };
  grantedToUser: {
    email: string;
  };
  patient: {
    firstName: string;
    lastName: string;
    medicalRecordNumber: string;
  };
}

/**
 * Create a BTG emergency access grant
 * Only ADMIN users can grant access
 */
export async function createBtgGrant(
  request: CreateBtgGrantRequest,
  requestingUser: JwtPayload,
  ipAddress?: string
): Promise<BtgGrantResponse> {
  // Verify requesting user is ADMIN
  if (requestingUser.role !== Role.ADMIN) {
    await logAuditEvent({
      userId: requestingUser.userId,
      action: 'BTG_GRANT_ACCESS_FAILURE',
      resource: 'btg_access_grants',
      resourceId: null,
      details: {
        reason: 'Insufficient permissions',
        attemptedGrantTo: request.grantedToUserId,
        attemptedPatient: request.patientId,
      },
      ipAddress,
    });

    throw new Error('Forbidden: Only ADMIN users can grant BTG access');
  }

  // Validate duration
  if (!ALLOWED_DURATIONS.includes(request.durationMinutes)) {
    await logAuditEvent({
      userId: requestingUser.userId,
      action: 'BTG_GRANT_ACCESS_FAILURE',
      resource: 'btg_access_grants',
      resourceId: null,
      details: {
        reason: 'Invalid duration',
        attemptedDuration: request.durationMinutes,
        allowedDurations: ALLOWED_DURATIONS,
      },
      ipAddress,
    });

    throw new Error(
      `Invalid duration. Allowed values: ${ALLOWED_DURATIONS.join(', ')} minutes`
    );
  }

  // Validate justification
  if (!request.justification || request.justification.length < 25) {
    await logAuditEvent({
      userId: requestingUser.userId,
      action: 'BTG_GRANT_ACCESS_FAILURE',
      resource: 'btg_access_grants',
      resourceId: null,
      details: {
        reason: 'Justification too short',
        justificationLength: request.justification?.length || 0,
      },
      ipAddress,
    });

    throw new Error('Justification must be at least 25 characters');
  }

  if (request.justification.length > 500) {
    throw new Error('Justification must not exceed 500 characters');
  }

  // Verify granted-to user exists and is ADMIN
  const grantedToUser = await prisma.user.findUnique({
    where: { id: request.grantedToUserId },
    select: { id: true, email: true, role: true },
  });

  if (!grantedToUser) {
    await logAuditEvent({
      userId: requestingUser.userId,
      action: 'BTG_GRANT_ACCESS_FAILURE',
      resource: 'btg_access_grants',
      resourceId: null,
      details: {
        reason: 'Granted-to user not found',
        attemptedGrantTo: request.grantedToUserId,
      },
      ipAddress,
    });

    throw new Error('grantedToUserId does not exist');
  }

  if (grantedToUser.role !== Role.ADMIN) {
    await logAuditEvent({
      userId: requestingUser.userId,
      action: 'BTG_GRANT_ACCESS_FAILURE',
      resource: 'btg_access_grants',
      resourceId: null,
      details: {
        reason: 'Granted-to user is not ADMIN',
        attemptedGrantTo: request.grantedToUserId,
        userRole: grantedToUser.role,
      },
      ipAddress,
    });

    throw new Error('Can only grant BTG access to ADMIN users');
  }

  // Verify patient exists
  const patient = await prisma.patient.findUnique({
    where: { id: request.patientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      medicalRecordNumber: true,
    },
  });

  if (!patient) {
    await logAuditEvent({
      userId: requestingUser.userId,
      action: 'BTG_GRANT_ACCESS_FAILURE',
      resource: 'btg_access_grants',
      resourceId: null,
      details: {
        reason: 'Patient not found',
        attemptedPatient: request.patientId,
      },
      ipAddress,
    });

    throw new Error('Patient not found');
  }

  // Calculate expiration time
  const now = new Date();
  const expiresAt = new Date(now.getTime() + request.durationMinutes * 60 * 1000);

  // Create the grant
  const grant = await prisma.btgAccessGrant.create({
    data: {
      grantedByUserId: requestingUser.userId,
      grantedToUserId: request.grantedToUserId,
      patientId: request.patientId,
      justification: request.justification,
      durationMinutes: request.durationMinutes,
      expiresAt,
    },
  });

  // Comprehensive audit log (successful grant)
  await logAuditEvent({
    userId: requestingUser.userId,
    action: 'BTG_GRANT_ACCESS',
    resource: 'btg_access_grants',
    resourceId: grant.id,
    details: {
      grantedToUserId: request.grantedToUserId,
      grantedToEmail: grantedToUser.email,
      patientId: request.patientId,
      patientMRN: patient.medicalRecordNumber,
      patientName: `${patient.firstName} ${patient.lastName}`,
      justification: request.justification,
      durationMinutes: request.durationMinutes,
      expiresAt: expiresAt.toISOString(),
    },
    ipAddress,
  });

  // CloudWatch structured log for alerting
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'SECURITY',
    action: 'BTG_GRANT_ACCESS',
    userId: requestingUser.userId,
    userEmail: requestingUser.email,
    grantId: grant.id,
    grantedToUserId: request.grantedToUserId,
    grantedToEmail: grantedToUser.email,
    patientId: request.patientId,
    patientMRN: patient.medicalRecordNumber,
    justification: request.justification,
    durationMinutes: request.durationMinutes,
    expiresAt: expiresAt.toISOString(),
    ipAddress,
    message: 'BTG emergency access grant created',
  }));

  return {
    success: true,
    grantId: grant.id,
    expiresAt: grant.expiresAt,
    message: `Emergency access granted for ${request.durationMinutes} minutes`,
  };
}

/**
 * Revoke a BTG grant before it expires
 */
export async function revokeBtgGrant(
  grantId: string,
  reason: string,
  requestingUser: JwtPayload,
  ipAddress?: string
): Promise<{ success: boolean; message: string }> {
  // Verify requesting user is ADMIN
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only ADMIN users can revoke BTG access');
  }

  // Find the grant
  const grant = await prisma.btgAccessGrant.findUnique({
    where: { id: grantId },
    include: {
      grantedToUser: { select: { email: true } },
      patient: { select: { medicalRecordNumber: true, firstName: true, lastName: true } },
    },
  });

  if (!grant) {
    throw new Error('Grant not found');
  }

  // Check if already revoked
  if (grant.revokedAt) {
    throw new Error('Grant has already been revoked');
  }

  // Check if already expired
  if (new Date() > grant.expiresAt) {
    throw new Error('Grant has already expired');
  }

  // Revoke the grant
  const revokedGrant = await prisma.btgAccessGrant.update({
    where: { id: grantId },
    data: {
      revokedAt: new Date(),
      revokedByUserId: requestingUser.userId,
      revokedReason: reason,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: requestingUser.userId,
    action: 'BTG_REVOKE_ACCESS',
    resource: 'btg_access_grants',
    resourceId: grantId,
    details: {
      grantedToEmail: grant.grantedToUser.email,
      patientMRN: grant.patient.medicalRecordNumber,
      patientName: `${grant.patient.firstName} ${grant.patient.lastName}`,
      revokedReason: reason,
      originalExpiresAt: grant.expiresAt.toISOString(),
      revokedAt: revokedGrant.revokedAt?.toISOString(),
    },
    ipAddress,
  });

  return {
    success: true,
    message: 'Emergency access revoked successfully',
  };
}

/**
 * Get active BTG grants
 * Returns all grants that are currently active (not expired, not revoked)
 */
export async function getActiveBtgGrants(
  requestingUser: JwtPayload
): Promise<BtgGrant[]> {
  // Verify requesting user is ADMIN
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only ADMIN users can view BTG grants');
  }

  const now = new Date();

  const grants = await prisma.btgAccessGrant.findMany({
    where: {
      expiresAt: {
        gt: now, // Not expired
      },
      revokedAt: null, // Not revoked
    },
    include: {
      grantedByUser: {
        select: { email: true },
      },
      grantedToUser: {
        select: { email: true },
      },
      patient: {
        select: {
          firstName: true,
          lastName: true,
          medicalRecordNumber: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return grants;
}

/**
 * Check if a user has active BTG access to a patient
 * Used by authorization middleware
 */
export async function hasActiveBtgAccess(
  userId: string,
  patientId: string
): Promise<boolean> {
  const now = new Date();

  const activeGrant = await prisma.btgAccessGrant.findFirst({
    where: {
      grantedToUserId: userId,
      patientId,
      expiresAt: {
        gt: now,
      },
      revokedAt: null,
    },
  });

  return !!activeGrant;
}

/**
 * Cleanup expired grants (should be run periodically via cron job)
 * This is for database maintenance, not for security enforcement
 */
export async function cleanupExpiredGrants(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await prisma.btgAccessGrant.deleteMany({
    where: {
      expiresAt: {
        lt: thirtyDaysAgo,
      },
    },
  });

  return result.count;
}
