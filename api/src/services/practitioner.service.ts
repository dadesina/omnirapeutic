/**
 * Practitioner Service
 *
 * Handles all Practitioner-related business logic with RBAC enforcement
 */

import { Role, Practitioner } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';

export interface CreatePractitionerData {
  userId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialization: string;
  phoneNumber?: string;
  credentials?: string[];
}

export interface UpdatePractitionerData {
  firstName?: string;
  lastName?: string;
  specialization?: string;
  phoneNumber?: string;
}

export interface PractitionerFilters {
  page?: number;
  limit?: number;
  search?: string;
  specialization?: string;
}

/**
 * Create a new practitioner (Admin only)
 */
export const createPractitioner = async (
  data: CreatePractitionerData,
  requestingUser: JwtPayload
): Promise<Practitioner> => {
  // RBAC: Only admins can create practitioners
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can create practitioners');
  }

  // Organization scoping: Regular admins can only create practitioners in their org
  if (!requestingUser.isSuperAdmin && data.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only create practitioners in your own organization');
  }

  // Validate that the user belongs to the same organization
  const user = await prisma.user.findUnique({
    where: { id: data.userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.organizationId !== data.organizationId) {
    throw new Error('User must belong to the same organization as the practitioner');
  }

  // Check for duplicate license number within the organization
  const existingPractitioner = await prisma.practitioner.findFirst({
    where: {
      organizationId: data.organizationId,
      licenseNumber: data.licenseNumber
    }
  });

  if (existingPractitioner) {
    throw new Error('License number already exists in this organization');
  }

  // Create practitioner
  const practitioner = await prisma.practitioner.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      licenseNumber: data.licenseNumber,
      specialization: data.specialization,
      phoneNumber: data.phoneNumber,
      credentials: data.credentials || []
    }
  });

  return practitioner;
};

/**
 * Get all practitioners with pagination (Admin and Practitioner)
 */
export const getAllPractitioners = async (
  requestingUser: JwtPayload,
  filters: PractitionerFilters = {}
): Promise<{ practitioners: Practitioner[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
  // RBAC: Only admins and practitioners can view all practitioners
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause for search and filters
  const where: any = {};

  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { licenseNumber: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  if (filters.specialization) {
    where.specialization = { equals: filters.specialization, mode: 'insensitive' };
  }

  // Organization scoping: Super Admins see all orgs, regular users see only their org
  if (!requestingUser.isSuperAdmin) {
    where.organizationId = requestingUser.organizationId;
  }

  // Get practitioners with pagination
  const [practitioners, total] = await Promise.all([
    prisma.practitioner.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.practitioner.count({ where })
  ]);

  return {
    practitioners,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get practitioner by ID with RBAC
 * - Super Admin: can view any practitioner in any organization
 * - Admin: can view practitioners in their organization
 * - Practitioner: can view practitioners in their organization (including own profile)
 * - Patient: can view practitioners in their organization (for finding care providers)
 */
export const getPractitionerById = async (
  practitionerId: string,
  requestingUser: JwtPayload
): Promise<Practitioner> => {
  const practitioner = await prisma.practitioner.findUnique({
    where: { id: practitionerId }
  });

  if (!practitioner) {
    throw new Error('Practitioner not found');
  }

  // Super Admins can access any practitioner
  if (requestingUser.isSuperAdmin) {
    return practitioner;
  }

  // Organization boundary check: Users can only view practitioners in their org
  if (practitioner.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only view practitioners in your organization');
  }

  return practitioner;
};

/**
 * Update practitioner
 * - Super Admin: can update any practitioner in any organization
 * - Admin: can update practitioners in their organization
 * - Practitioner: can update own profile only
 */
export const updatePractitioner = async (
  practitionerId: string,
  data: UpdatePractitionerData,
  requestingUser: JwtPayload
): Promise<Practitioner> => {
  // Check if practitioner exists
  const existingPractitioner = await prisma.practitioner.findUnique({
    where: { id: practitionerId }
  });

  if (!existingPractitioner) {
    throw new Error('Practitioner not found');
  }

  // RBAC: Admins can update practitioners in their org, practitioners can update own profile
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isOwner = existingPractitioner.userId === requestingUser.userId;
  const isSameOrg = existingPractitioner.organizationId === requestingUser.organizationId;

  // Super Admins can update any practitioner
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only update practitioners in your organization');
    }

    // Role-based check within organization
    if (!isAdmin && !isOwner) {
      throw new Error('Forbidden: You can only update your own practitioner profile');
    }
  }

  // Update practitioner
  const updatedPractitioner = await prisma.practitioner.update({
    where: { id: practitionerId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      specialization: data.specialization,
      phoneNumber: data.phoneNumber
    }
  });

  return updatedPractitioner;
};

/**
 * Delete practitioner (Admin only)
 */
export const deletePractitioner = async (
  practitionerId: string,
  requestingUser: JwtPayload
): Promise<void> => {
  // RBAC: Only admins can delete practitioners
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can delete practitioners');
  }

  // Check if practitioner exists
  const practitioner = await prisma.practitioner.findUnique({
    where: { id: practitionerId }
  });

  if (!practitioner) {
    throw new Error('Practitioner not found');
  }

  // Organization boundary check: Regular admins can only delete practitioners in their org
  if (!requestingUser.isSuperAdmin && practitioner.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only delete practitioners in your organization');
  }

  // Delete practitioner
  await prisma.practitioner.delete({
    where: { id: practitionerId }
  });
};

/**
 * Get practitioner by user ID
 */
export const getPractitionerByUserId = async (userId: string): Promise<Practitioner | null> => {
  return await prisma.practitioner.findUnique({
    where: { userId }
  });
};
