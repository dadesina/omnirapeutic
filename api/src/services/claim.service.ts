/**
 * Claim Service
 *
 * Handles claim generation and management with comprehensive validation
 * Generates claims from completed sessions with proper billing calculations
 */

import { Role, Claim, ClaimLineItem, ClaimStatus, SessionStatus, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';

export interface CreateClaimFromSessionsData {
  sessionIds: string[];
}

export interface ClaimFilters {
  page?: number;
  limit?: number;
  status?: ClaimStatus;
  patientId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Generate claim number in format: ORG-YYYYMMDD-NNNN
 * Sequential number resets daily per organization
 */
async function generateClaimNumber(
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  // Get today's date in YYYYMMDD format
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  // Find the most recent claim for this org today
  const latestClaim = await tx.claim.findFirst({
    where: {
      organizationId,
      createdAt: {
        gte: new Date(today.setHours(0, 0, 0, 0)),
        lt: new Date(today.setHours(23, 59, 59, 999))
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  let sequence = 1;
  if (latestClaim) {
    // Extract sequence from claim number (format: ORG-YYYYMMDD-NNNN)
    const parts = latestClaim.claimNumber.split('-');
    if (parts.length === 3) {
      sequence = parseInt(parts[2]) + 1;
    }
  }

  // Pad sequence to 4 digits
  const sequenceStr = sequence.toString().padStart(4, '0');

  // Get organization prefix (first 3 chars of org ID, uppercase)
  const orgPrefix = organizationId.substring(0, 3).toUpperCase();

  return `${orgPrefix}-${dateStr}-${sequenceStr}`;
}

/**
 * Create a claim from completed sessions (Admin only)
 * This performs comprehensive validation and creates the claim with line items atomically
 */
export const createClaimFromSessions = async (
  data: CreateClaimFromSessionsData,
  requestingUser: JwtPayload
): Promise<Claim & { lineItems: ClaimLineItem[] }> => {
  // RBAC: Only admins can create claims
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can create claims');
  }

  if (!data.sessionIds || data.sessionIds.length === 0) {
    throw new Error('At least one session ID is required');
  }

  // Use a transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch all sessions with related data
    const sessions = await tx.session.findMany({
      where: {
        id: { in: data.sessionIds }
      },
      include: {
        patient: {
          include: {
            insurance: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        },
        serviceCode: {
          include: {
            defaultBillingCode: true
          }
        },
        claimLineItem: true
      }
    });

    // 2. Validation: Session existence
    if (sessions.length !== data.sessionIds.length) {
      throw new Error('One or more session IDs are invalid');
    }

    // 3. Validation: Organization scope
    const invalidOrgSessions = sessions.filter(
      s => s.organizationId !== requestingUser.organizationId
    );
    if (invalidOrgSessions.length > 0) {
      throw new Error('All sessions must belong to your organization');
    }

    // 4. Validation: Patient consistency
    const patientIds = new Set(sessions.map(s => s.patientId));
    if (patientIds.size > 1) {
      throw new Error('All sessions must belong to the same patient');
    }
    const patientId = sessions[0].patientId;

    // 5. Validation: Status check
    const incompleteSessions = sessions.filter(s => s.status !== SessionStatus.COMPLETED);
    if (incompleteSessions.length > 0) {
      throw new Error(
        `All sessions must have COMPLETED status. Found ${incompleteSessions.length} incomplete session(s)`
      );
    }

    // 6. Validation: No double billing
    const alreadyBilled = sessions.filter(s => s.claimLineItem !== null);
    if (alreadyBilled.length > 0) {
      throw new Error(
        `${alreadyBilled.length} session(s) have already been billed and cannot be included in a new claim`
      );
    }

    // 7. Validation: Billable services
    const nonBillableSessions = sessions.filter(
      s => !s.serviceCode.defaultBillingCodeId || !s.serviceCode.defaultBillingCode
    );
    if (nonBillableSessions.length > 0) {
      throw new Error(
        `${nonBillableSessions.length} session(s) have no billable service code configured`
      );
    }

    // 8. Validation: Patient insurance
    const patient = sessions[0].patient;
    if (!patient.insurance || patient.insurance.length === 0) {
      throw new Error('Patient has no active insurance on file');
    }
    const primaryInsurance = patient.insurance[0];

    // 9. Calculate date range
    const sessionDates = sessions.map(s => s.startTime);
    const dateOfServiceStart = new Date(Math.min(...sessionDates.map(d => d.getTime())));
    const dateOfServiceEnd = new Date(Math.max(...sessionDates.map(d => d.getTime())));

    // 10. Build line items and calculate totals
    const lineItemsData: Prisma.ClaimLineItemCreateWithoutClaimInput[] = [];
    let totalBilledAmount = new Prisma.Decimal(0);

    for (const session of sessions) {
      const billingCode = session.serviceCode.defaultBillingCode!;
      const units = new Prisma.Decimal(session.unitsUsed);
      const billedAmount = units.times(billingCode.rate);

      lineItemsData.push({
        session: { connect: { id: session.id } },
        serviceCode: billingCode.code,
        modifiers: [], // Future: support for modifiers
        units,
        billedAmount,
        dateOfService: session.startTime
      });

      totalBilledAmount = totalBilledAmount.plus(billedAmount);
    }

    // 11. Create insurance snapshot
    const payerDetails = {
      payerName: primaryInsurance.payerName,
      payerId: primaryInsurance.payerId,
      memberNumber: primaryInsurance.memberNumber,
      groupNumber: primaryInsurance.groupNumber,
      effectiveDate: primaryInsurance.effectiveDate,
      snapshotDate: new Date()
    };

    // 12. Generate claim number
    const claimNumber = await generateClaimNumber(requestingUser.organizationId!, tx);

    // 13. Create claim with line items
    const claim = await tx.claim.create({
      data: {
        organizationId: requestingUser.organizationId!,
        patientId,
        status: ClaimStatus.DRAFT,
        totalBilledAmount,
        dateOfServiceStart,
        dateOfServiceEnd,
        payerDetails,
        claimNumber,
        lineItems: {
          create: lineItemsData
        }
      },
      include: {
        lineItems: {
          include: {
            session: {
              include: {
                serviceCode: true
              }
            }
          }
        },
        patient: true
      }
    });

    return claim;
  });
};

/**
 * Get claims with pagination and filtering
 */
export const getClaims = async (
  filters: ClaimFilters,
  requestingUser: JwtPayload
): Promise<{ claims: Claim[]; total: number; page: number; limit: number }> => {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.ClaimWhereInput = {
    organizationId: requestingUser.organizationId!
  };

  // Status filter
  if (filters.status) {
    where.status = filters.status;
  }

  // Patient filter
  if (filters.patientId) {
    where.patientId = filters.patientId;
  }

  // Date range filter
  if (filters.startDate || filters.endDate) {
    where.dateOfServiceStart = {};
    if (filters.startDate) {
      where.dateOfServiceStart.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.dateOfServiceStart.lte = filters.endDate;
    }
  }

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            medicalRecordNumber: true
          }
        },
        lineItems: {
          include: {
            session: {
              select: {
                id: true,
                startTime: true,
                endTime: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.claim.count({ where })
  ]);

  return {
    claims,
    total,
    page,
    limit
  };
};

/**
 * Get a single claim by ID
 */
export const getClaimById = async (
  id: string,
  requestingUser: JwtPayload
): Promise<Claim & { lineItems: ClaimLineItem[] }> => {
  const claim = await prisma.claim.findUnique({
    where: { id },
    include: {
      patient: true,
      lineItems: {
        include: {
          session: {
            include: {
              serviceCode: true,
              practitioner: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  // Organization scoping
  if (claim.organizationId !== requestingUser.organizationId && !requestingUser.isSuperAdmin) {
    throw new Error('Forbidden: You can only access claims in your organization');
  }

  return claim;
};

/**
 * Update claim status (Admin only)
 */
export const updateClaimStatus = async (
  id: string,
  status: ClaimStatus,
  requestingUser: JwtPayload
): Promise<Claim> => {
  // RBAC: Only admins can update claim status
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can update claim status');
  }

  // Find existing claim
  const existing = await prisma.claim.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('Claim not found');
  }

  // Organization scoping
  if (existing.organizationId !== requestingUser.organizationId && !requestingUser.isSuperAdmin) {
    throw new Error('Forbidden: You can only update claims in your organization');
  }

  // Validate status transitions
  const validTransitions: Record<ClaimStatus, ClaimStatus[]> = {
    [ClaimStatus.DRAFT]: [ClaimStatus.READY_TO_SUBMIT],
    [ClaimStatus.READY_TO_SUBMIT]: [ClaimStatus.SUBMITTED, ClaimStatus.DRAFT],
    [ClaimStatus.SUBMITTED]: [ClaimStatus.PAID, ClaimStatus.REJECTED, ClaimStatus.DENIED],
    [ClaimStatus.PAID]: [], // Terminal state
    [ClaimStatus.REJECTED]: [ClaimStatus.DRAFT], // Can edit and resubmit
    [ClaimStatus.DENIED]: [ClaimStatus.DRAFT] // Can edit and resubmit
  };

  if (!validTransitions[existing.status].includes(status)) {
    throw new Error(
      `Invalid status transition from ${existing.status} to ${status}`
    );
  }

  // Update claim
  const claim = await prisma.claim.update({
    where: { id },
    data: {
      status,
      submittedAt: status === ClaimStatus.SUBMITTED ? new Date() : existing.submittedAt
    }
  });

  return claim;
};
