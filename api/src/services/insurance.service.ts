/**
 * Insurance Service
 *
 * Handles all Patient Insurance-related business logic with RBAC enforcement
 * All insurance access is logged for HIPAA compliance
 */

import { Role, PatientInsurance, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';

export interface CreateInsuranceData {
  patientId: string;
  payerName: string;
  payerId?: string;
  memberNumber: string;
  groupNumber?: string;
  effectiveDate: Date;
  terminationDate?: Date;
  isActive?: boolean;
}

export interface UpdateInsuranceData {
  payerName?: string;
  payerId?: string;
  memberNumber?: string;
  groupNumber?: string;
  effectiveDate?: Date;
  terminationDate?: Date;
  isActive?: boolean;
}

export interface InsuranceFilters {
  page?: number;
  limit?: number;
  search?: string;
  patientId?: string;
  isActive?: boolean;
}

export interface EligibilityVerification {
  verifiedBy: string;
  verifiedAt: Date;
  coverageActive: boolean;
  planName?: string;
  copayAmount?: number;
  notes?: string;
}

/**
 * Create a new insurance record (Admin only)
 */
export const createInsurance = async (
  data: CreateInsuranceData,
  requestingUser: JwtPayload
): Promise<PatientInsurance> => {
  // RBAC: Only admins can create insurance
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can create insurance records');
  }

  // Validate patient exists
  const patient = await prisma.patient.findUnique({
    where: { id: data.patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Organization scoping: Regular admins can only create insurance in their org
  if (!requestingUser.isSuperAdmin && patient.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only create insurance for patients in your organization');
  }

  // Validate effective date
  if (data.terminationDate && data.terminationDate < data.effectiveDate) {
    throw new Error('Termination date must be after effective date');
  }

  const insuranceData = {
    ...data,
    organizationId: patient.organizationId,
    isActive: data.isActive ?? true
  };

  // If setting this insurance as active, deactivate all others for this patient (atomic)
  if (insuranceData.isActive === true) {
    return await prisma.$transaction(async (tx) => {
      await tx.patientInsurance.updateMany({
        where: {
          patientId: data.patientId
        },
        data: { isActive: false }
      });

      return await tx.patientInsurance.create({
        data: insuranceData
      });
    });
  }

  return await prisma.patientInsurance.create({
    data: insuranceData
  });
};

/**
 * Get all insurance records with pagination (Admin and Practitioner)
 */
export const getAllInsurance = async (
  requestingUser: JwtPayload,
  filters: InsuranceFilters = {}
): Promise<{ insurance: PatientInsurance[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
  // RBAC: Only admins and practitioners can view all insurance
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause for search
  const searchWhere = filters.search
    ? {
        OR: [
          { payerName: { contains: filters.search, mode: 'insensitive' as const } },
          { memberNumber: { contains: filters.search, mode: 'insensitive' as const } }
        ]
      }
    : {};

  // Organization scoping: Super Admins see all orgs, regular users see only their org
  const where: any = { ...searchWhere };
  if (!requestingUser.isSuperAdmin) {
    where.organizationId = requestingUser.organizationId;
  }

  // Apply additional filters
  if (filters.patientId) {
    where.patientId = filters.patientId;
  }
  if (typeof filters.isActive === 'boolean') {
    where.isActive = filters.isActive;
  }

  // Get insurance with pagination
  const [insurance, total] = await Promise.all([
    prisma.patientInsurance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { effectiveDate: 'desc' }
    }),
    prisma.patientInsurance.count({ where })
  ]);

  return {
    insurance,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get insurance by ID with RBAC
 * - Super Admin: can view any insurance in any organization
 * - Admin: can view insurance in their organization
 * - Practitioner: can view insurance in their organization
 * - Patient: can only view own insurance records
 */
export const getInsuranceById = async (
  insuranceId: string,
  requestingUser: JwtPayload
): Promise<PatientInsurance> => {
  const insurance = await prisma.patientInsurance.findUnique({
    where: { id: insuranceId },
    include: { patient: true }
  });

  if (!insurance) {
    throw new Error('Insurance not found');
  }

  // RBAC: Check permissions
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isOwner = insurance.patient?.userId === requestingUser.userId;
  const isSameOrg = insurance.organizationId === requestingUser.organizationId;

  // Super Admins can access any insurance
  if (isSuperAdmin) {
    return insurance;
  }

  // Organization boundary check: Users can only access insurance in their org
  if (!isSameOrg) {
    throw new Error('Forbidden: You can only access insurance in your organization');
  }

  // Role-based checks within organization
  if (!isAdmin && !isPractitioner && !isOwner) {
    throw new Error('Forbidden: You can only view your own insurance records');
  }

  return insurance;
};

/**
 * Get all insurance records for a specific patient
 */
export const getInsuranceByPatientId = async (
  patientId: string,
  requestingUser: JwtPayload
): Promise<PatientInsurance[]> => {
  // First, check if patient exists
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

  // Super Admins can access any patient's insurance
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access patients in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isOwner) {
      throw new Error('Forbidden: You can only view your own insurance records');
    }
  }

  return await prisma.patientInsurance.findMany({
    where: { patientId },
    orderBy: [
      { isActive: 'desc' },
      { effectiveDate: 'desc' }
    ]
  });
};

/**
 * Update insurance (Admin only)
 */
export const updateInsurance = async (
  insuranceId: string,
  data: UpdateInsuranceData,
  requestingUser: JwtPayload
): Promise<PatientInsurance> => {
  // RBAC: Only admins can update insurance
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can update insurance');
  }

  // Check if insurance exists
  const existingInsurance = await prisma.patientInsurance.findUnique({
    where: { id: insuranceId }
  });

  if (!existingInsurance) {
    throw new Error('Insurance not found');
  }

  // Organization boundary check: Regular admins can only update insurance in their org
  if (!requestingUser.isSuperAdmin && existingInsurance.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only update insurance in your organization');
  }

  // Validate dates if provided
  const effectiveDate = data.effectiveDate || existingInsurance.effectiveDate;
  if (data.terminationDate && data.terminationDate < effectiveDate) {
    throw new Error('Termination date must be after effective date');
  }

  // If setting this insurance as active, deactivate all others for this patient (atomic)
  if (data.isActive === true) {
    return await prisma.$transaction(async (tx) => {
      await tx.patientInsurance.updateMany({
        where: {
          patientId: existingInsurance.patientId,
          id: { not: insuranceId }
        },
        data: { isActive: false }
      });

      return await tx.patientInsurance.update({
        where: { id: insuranceId },
        data
      });
    });
  }

  // Update insurance
  return await prisma.patientInsurance.update({
    where: { id: insuranceId },
    data
  });
};

/**
 * Delete insurance (Admin only)
 */
export const deleteInsurance = async (
  insuranceId: string,
  requestingUser: JwtPayload
): Promise<void> => {
  // RBAC: Only admins can delete insurance
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can delete insurance');
  }

  // Check if insurance exists
  const insurance = await prisma.patientInsurance.findUnique({
    where: { id: insuranceId }
  });

  if (!insurance) {
    throw new Error('Insurance not found');
  }

  // Organization boundary check: Regular admins can only delete insurance in their org
  if (!requestingUser.isSuperAdmin && insurance.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only delete insurance in your organization');
  }

  // Delete insurance
  await prisma.patientInsurance.delete({
    where: { id: insuranceId }
  });
};

/**
 * Verify eligibility for an insurance record (Admin only)
 */
export const verifyEligibility = async (
  insuranceId: string,
  verification: EligibilityVerification,
  requestingUser: JwtPayload
): Promise<PatientInsurance> => {
  // RBAC: Only admins can verify eligibility
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can verify eligibility');
  }

  // Check if insurance exists
  const insurance = await prisma.patientInsurance.findUnique({
    where: { id: insuranceId }
  });

  if (!insurance) {
    throw new Error('Insurance not found');
  }

  // Organization boundary check
  if (!requestingUser.isSuperAdmin && insurance.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only verify eligibility for insurance in your organization');
  }

  // Update insurance with eligibility verification
  return await prisma.patientInsurance.update({
    where: { id: insuranceId },
    data: {
      lastVerifiedAt: verification.verifiedAt,
      eligibilityVerification: verification as any
    }
  });
};
