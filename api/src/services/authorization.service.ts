/**
 * Authorization Service
 *
 * Handles all Authorization-related business logic with RBAC enforcement
 * This is THE MOST CRITICAL service - prevents overbilling (ABA clinic #1 pain point)
 * All unit operations are atomic to prevent race conditions
 */

import { Role, Authorization, Prisma, AuthStatus } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';
import { withRetryMetrics } from '../utils/retry';

export interface CreateAuthorizationData {
  patientId: string;
  insuranceId?: string;
  serviceCodeId: string;
  authNumber?: string;
  totalUnits: number;
  startDate: Date;
  endDate: Date;
  status?: AuthStatus;
  notes?: string;
}

export interface UpdateAuthorizationData {
  insuranceId?: string;
  serviceCodeId?: string;
  authNumber?: string;
  totalUnits?: number;
  startDate?: Date;
  endDate?: Date;
  status?: AuthStatus;
  notes?: string;
}

export interface AuthorizationFilters {
  page?: number;
  limit?: number;
  search?: string;
  patientId?: string;
  status?: AuthStatus;
}

/**
 * Helper: Compute effective status (EXPIRED if past endDate, EXHAUSTED if no units left)
 */
const getComputedStatus = (auth: Authorization): AuthStatus => {
  if (auth.status === AuthStatus.CANCELLED) {
    return AuthStatus.CANCELLED;
  }
  if (auth.endDate < new Date()) {
    return AuthStatus.EXPIRED;
  }
  if (auth.usedUnits + auth.scheduledUnits >= auth.totalUnits) {
    return AuthStatus.EXHAUSTED;
  }
  return auth.status;
};

/**
 * Create a new authorization (Admin only)
 */
export const createAuthorization = async (
  data: CreateAuthorizationData,
  requestingUser: JwtPayload
): Promise<Authorization> => {
  // RBAC: Only admins can create authorizations
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can create authorizations');
  }

  // Validate patient exists
  const patient = await prisma.patient.findUnique({
    where: { id: data.patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Organization scoping
  if (!requestingUser.isSuperAdmin && patient.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only create authorizations for patients in your organization');
  }

  // Validate dates
  if (data.endDate < data.startDate) {
    throw new Error('End date must be after start date');
  }

  // Validate totalUnits
  if (data.totalUnits <= 0) {
    throw new Error('Total units must be greater than 0');
  }

  // Create authorization
  return await prisma.authorization.create({
    data: {
      ...data,
      organizationId: patient.organizationId,
      usedUnits: 0,
      scheduledUnits: 0,
      status: data.status || AuthStatus.ACTIVE
    }
  });
};

/**
 * Get all authorizations with pagination (Admin and Practitioner)
 */
export const getAllAuthorizations = async (
  requestingUser: JwtPayload,
  filters: AuthorizationFilters = {}
): Promise<{ authorizations: Authorization[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
  // RBAC: Only admins and practitioners can view all authorizations
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};
  if (!requestingUser.isSuperAdmin) {
    where.organizationId = requestingUser.organizationId;
  }

  if (filters.patientId) {
    where.patientId = filters.patientId;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.search) {
    where.authNumber = { contains: filters.search, mode: 'insensitive' as const };
  }

  // Get authorizations with pagination
  const [authorizations, total] = await Promise.all([
    prisma.authorization.findMany({
      where,
      skip,
      take: limit,
      orderBy: { endDate: 'desc' }
    }),
    prisma.authorization.count({ where })
  ]);

  // Compute effective status for each
  const computed = authorizations.map(auth => ({
    ...auth,
    status: getComputedStatus(auth)
  }));

  return {
    authorizations: computed,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get authorization by ID with RBAC
 */
export const getAuthorizationById = async (
  authorizationId: string,
  requestingUser: JwtPayload
): Promise<Authorization> => {
  const authorization = await prisma.authorization.findUnique({
    where: { id: authorizationId },
    include: { patient: true }
  });

  if (!authorization) {
    throw new Error('Authorization not found');
  }

  // RBAC: Check permissions
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isOwner = authorization.patient?.userId === requestingUser.userId;
  const isSameOrg = authorization.organizationId === requestingUser.organizationId;

  // Super Admins can access any authorization
  if (isSuperAdmin) {
    return { ...authorization, status: getComputedStatus(authorization) };
  }

  // Organization boundary check
  if (!isSameOrg) {
    throw new Error('Forbidden: You can only access authorizations in your organization');
  }

  // Role-based checks within organization
  if (!isAdmin && !isPractitioner && !isOwner) {
    throw new Error('Forbidden: You can only view your own authorization records');
  }

  return { ...authorization, status: getComputedStatus(authorization) };
};

/**
 * Get all authorizations for a specific patient
 */
export const getAuthorizationsByPatientId = async (
  patientId: string,
  requestingUser: JwtPayload
): Promise<Authorization[]> => {
  // Check if patient exists
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC checks
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isOwner = patient.userId === requestingUser.userId;
  const isSameOrg = patient.organizationId === requestingUser.organizationId;

  // Super Admins can access any patient's authorizations
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access patients in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isOwner) {
      throw new Error('Forbidden: You can only view your own authorization records');
    }
  }

  const authorizations = await prisma.authorization.findMany({
    where: { patientId },
    orderBy: [
      { status: 'asc' },
      { endDate: 'desc' }
    ]
  });

  return authorizations.map(auth => ({ ...auth, status: getComputedStatus(auth) }));
};

/**
 * Update authorization (Admin only)
 */
export const updateAuthorization = async (
  authorizationId: string,
  data: UpdateAuthorizationData,
  requestingUser: JwtPayload
): Promise<Authorization> => {
  // RBAC: Only admins can update authorizations
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can update authorizations');
  }

  // Check if authorization exists
  const existingAuth = await prisma.authorization.findUnique({
    where: { id: authorizationId }
  });

  if (!existingAuth) {
    throw new Error('Authorization not found');
  }

  // Organization boundary check
  if (!requestingUser.isSuperAdmin && existingAuth.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only update authorizations in your organization');
  }

  // Validate dates if provided
  const startDate = data.startDate || existingAuth.startDate;
  const endDate = data.endDate || existingAuth.endDate;
  if (endDate < startDate) {
    throw new Error('End date must be after start date');
  }

  // Update authorization
  return await prisma.authorization.update({
    where: { id: authorizationId },
    data
  });
};

/**
 * Delete authorization (Admin only)
 */
export const deleteAuthorization = async (
  authorizationId: string,
  requestingUser: JwtPayload
): Promise<void> => {
  // RBAC: Only admins can delete authorizations
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can delete authorizations');
  }

  // Check if authorization exists
  const authorization = await prisma.authorization.findUnique({
    where: { id: authorizationId }
  });

  if (!authorization) {
    throw new Error('Authorization not found');
  }

  // Organization boundary check
  if (!requestingUser.isSuperAdmin && authorization.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only delete authorizations in your organization');
  }

  // Delete authorization
  await prisma.authorization.delete({
    where: { id: authorizationId }
  });
};

/**
 * Check available units for an authorization
 */
export const checkAvailableUnits = async (
  authorizationId: string,
  requestingUser: JwtPayload
): Promise<{ availableUnits: number; totalUnits: number; usedUnits: number; scheduledUnits: number; status: AuthStatus }> => {
  const authorization = await getAuthorizationById(authorizationId, requestingUser);

  const availableUnits = authorization.totalUnits - authorization.usedUnits - authorization.scheduledUnits;

  return {
    availableUnits: availableUnits > 0 ? availableUnits : 0,
    totalUnits: authorization.totalUnits,
    usedUnits: authorization.usedUnits,
    scheduledUnits: authorization.scheduledUnits,
    status: getComputedStatus(authorization)
  };
};

/**
 * ATOMIC: Reserve units for a scheduled appointment (Admin or Practitioner)
 */
export const reserveUnits = async (
  authorizationId: string,
  units: number,
  requestingUser: JwtPayload
): Promise<Authorization> => {
  // RBAC: Admin or Practitioner only
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can reserve units');
  }

  if (units <= 0) {
    throw new Error('Units must be greater than 0');
  }

  return await withRetryMetrics(async () => {
    return await prisma.$transaction(async (tx) => {
      // Lock the authorization row
      const auth = await tx.authorization.findUnique({
        where: { id: authorizationId }
      });

      if (!auth) {
        throw new Error('Authorization not found');
      }

      // Organization check
      if (!requestingUser.isSuperAdmin && auth.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only reserve units in your organization');
      }

      // Status checks
      if (auth.status !== AuthStatus.ACTIVE) {
        throw new Error('Cannot reserve units on an inactive authorization');
      }
      if (auth.endDate < new Date()) {
        throw new Error('Cannot reserve units on an expired authorization');
      }

      // Check available units
      const available = auth.totalUnits - auth.usedUnits - auth.scheduledUnits;
      if (available < units) {
        throw new Error(`Insufficient units available. Available: ${available}, Requested: ${units}`);
      }

      // Reserve units atomically
      return await tx.authorization.update({
        where: { id: authorizationId },
        data: {
          scheduledUnits: { increment: units }
        }
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
};

/**
 * ATOMIC: Release reserved units (e.g., cancelled appointment) (Admin or Practitioner)
 */
export const releaseUnits = async (
  authorizationId: string,
  units: number,
  requestingUser: JwtPayload
): Promise<Authorization> => {
  // RBAC: Admin or Practitioner only
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can release units');
  }

  if (units <= 0) {
    throw new Error('Units must be greater than 0');
  }

  return await withRetryMetrics(async () => {
    return await prisma.$transaction(async (tx) => {
      // Lock the authorization row
      const auth = await tx.authorization.findUnique({
        where: { id: authorizationId }
      });

      if (!auth) {
        throw new Error('Authorization not found');
      }

      // Organization check
      if (!requestingUser.isSuperAdmin && auth.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only release units in your organization');
      }

      // Check scheduledUnits
      if (auth.scheduledUnits < units) {
        throw new Error(`Cannot release more units than are scheduled. Scheduled: ${auth.scheduledUnits}, Requested: ${units}`);
      }

      // Release units atomically
      return await tx.authorization.update({
        where: { id: authorizationId },
        data: {
          scheduledUnits: { decrement: units }
        }
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
};

/**
 * ATOMIC: Consume units after session completion (Admin or Practitioner)
 * Moves units from scheduledUnits to usedUnits
 */
export const consumeUnits = async (
  authorizationId: string,
  units: number,
  requestingUser: JwtPayload
): Promise<Authorization> => {
  // RBAC: Admin or Practitioner only
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can consume units');
  }

  if (units <= 0) {
    throw new Error('Units must be greater than 0');
  }

  return await withRetryMetrics(async () => {
    return await prisma.$transaction(async (tx) => {
      // Lock the authorization row
      const auth = await tx.authorization.findUnique({
        where: { id: authorizationId }
      });

      if (!auth) {
        throw new Error('Authorization not found');
      }

      // Organization check
      if (!requestingUser.isSuperAdmin && auth.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only consume units in your organization');
      }

      // Status checks
      if (auth.status !== AuthStatus.ACTIVE) {
        throw new Error('Cannot consume units on an inactive authorization');
      }
      if (auth.endDate < new Date()) {
        throw new Error('Cannot consume units on an expired authorization');
      }

      // Check scheduledUnits
      if (auth.scheduledUnits < units) {
        throw new Error(`Cannot consume more units than are scheduled. Scheduled: ${auth.scheduledUnits}, Requested: ${units}`);
      }

      // Calculate new status
      const newUsedUnits = auth.usedUnits + units;
      const newScheduledUnits = auth.scheduledUnits - units;
      let newStatus: AuthStatus = auth.status;

      if (newUsedUnits + newScheduledUnits >= auth.totalUnits) {
        newStatus = AuthStatus.EXHAUSTED;
      }

      // Consume units atomically
      return await tx.authorization.update({
        where: { id: authorizationId },
        data: {
          usedUnits: { increment: units },
          scheduledUnits: { decrement: units },
          status: newStatus
        }
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
};

/**
 * Get active authorization for a patient and service code
 */
export const getActiveAuthorization = async (
  patientId: string,
  serviceCodeId: string,
  requestingUser: JwtPayload
): Promise<Authorization | null> => {
  // Validate patient access first
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC checks
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isSameOrg = patient.organizationId === requestingUser.organizationId;

  if (!isSuperAdmin && !isSameOrg) {
    throw new Error('Forbidden: You can only access patients in your organization');
  }

  if (!isSuperAdmin && !isAdmin && !isPractitioner) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  // Find active authorization
  const now = new Date();
  const authorization = await prisma.authorization.findFirst({
    where: {
      patientId,
      serviceCodeId,
      status: AuthStatus.ACTIVE,
      startDate: { lte: now },
      endDate: { gte: now }
    },
    orderBy: { endDate: 'desc' }
  });

  if (!authorization) {
    return null;
  }

  // Check if it has available units
  const availableUnits = authorization.totalUnits - authorization.usedUnits - authorization.scheduledUnits;
  if (availableUnits <= 0) {
    return null;
  }

  return { ...authorization, status: getComputedStatus(authorization) };
};
