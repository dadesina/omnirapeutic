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
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialization: string;
  phoneNumber?: string;
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

  // Create practitioner
  const practitioner = await prisma.practitioner.create({
    data: {
      userId: data.userId,
      firstName: data.firstName,
      lastName: data.lastName,
      licenseNumber: data.licenseNumber,
      specialization: data.specialization,
      phoneNumber: data.phoneNumber
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
): Promise<{ practitioners: Practitioner[]; total: number; page: number; limit: number }> => {
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
    total,
    page,
    limit
  };
};

/**
 * Get practitioner by ID with RBAC
 * - Admin: can view any practitioner
 * - Practitioner: can view any practitioner (including own profile)
 * - Patient: can view practitioners (for finding care providers)
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

  // All authenticated users can view practitioner profiles
  return practitioner;
};

/**
 * Update practitioner
 * - Admin: can update any practitioner
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

  // RBAC: Admins can update any practitioner, practitioners can update own profile
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isOwner = existingPractitioner.userId === requestingUser.userId;

  if (!isAdmin && !isOwner) {
    throw new Error('Forbidden: You can only update your own practitioner profile');
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
