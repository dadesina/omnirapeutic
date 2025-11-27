/**
 * Billing Code Service
 *
 * Handles all Billing Code-related business logic with RBAC enforcement
 * Billing codes are organization-specific and used for claim generation
 */

import { Role, BillingCode, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';

export interface CreateBillingCodeData {
  code: string;
  description: string;
  rate: number;
  category?: string;
  requiresModifier?: boolean;
}

export interface UpdateBillingCodeData {
  code?: string;
  description?: string;
  rate?: number;
  category?: string;
  requiresModifier?: boolean;
  isActive?: boolean;
}

export interface BillingCodeFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  isActive?: boolean;
}

/**
 * Create a new billing code (Admin only)
 */
export const createBillingCode = async (
  data: CreateBillingCodeData,
  requestingUser: JwtPayload
): Promise<BillingCode> => {
  // RBAC: Only admins can create billing codes
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can create billing codes');
  }

  // Check for existing code in organization
  const existing = await prisma.billingCode.findUnique({
    where: {
      organizationId_code: {
        organizationId: requestingUser.organizationId!,
        code: data.code
      }
    }
  });

  if (existing) {
    throw new Error('Billing code already exists for this organization');
  }

  // Validate rate is positive
  if (data.rate <= 0) {
    throw new Error('Billing rate must be greater than zero');
  }

  const billingCode = await prisma.billingCode.create({
    data: {
      organizationId: requestingUser.organizationId!,
      code: data.code,
      description: data.description,
      rate: data.rate,
      category: data.category || undefined,
      requiresModifier: data.requiresModifier ?? false,
      isActive: true
    }
  });

  return billingCode;
};

/**
 * Get billing codes with pagination and filtering
 */
export const getBillingCodes = async (
  filters: BillingCodeFilters,
  requestingUser: JwtPayload
): Promise<{ billingCodes: BillingCode[]; total: number; page: number; limit: number }> => {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.BillingCodeWhereInput = {
    organizationId: requestingUser.organizationId!
  };

  // Search filter
  if (filters.search) {
    where.OR = [
      { code: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  // Category filter
  if (filters.category) {
    where.category = filters.category;
  }

  // Active status filter
  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  const [billingCodes, total] = await Promise.all([
    prisma.billingCode.findMany({
      where,
      skip,
      take: limit,
      orderBy: { code: 'asc' }
    }),
    prisma.billingCode.count({ where })
  ]);

  return {
    billingCodes,
    total,
    page,
    limit
  };
};

/**
 * Get a single billing code by ID
 */
export const getBillingCodeById = async (
  id: string,
  requestingUser: JwtPayload
): Promise<BillingCode> => {
  const billingCode = await prisma.billingCode.findUnique({
    where: { id },
    include: {
      defaultForServiceCodes: true
    }
  });

  if (!billingCode) {
    throw new Error('Billing code not found');
  }

  // Organization scoping
  if (billingCode.organizationId !== requestingUser.organizationId && !requestingUser.isSuperAdmin) {
    throw new Error('Forbidden: You can only access billing codes in your organization');
  }

  return billingCode;
};

/**
 * Update a billing code (Admin only)
 */
export const updateBillingCode = async (
  id: string,
  data: UpdateBillingCodeData,
  requestingUser: JwtPayload
): Promise<BillingCode> => {
  // RBAC: Only admins can update billing codes
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can update billing codes');
  }

  // Find existing billing code
  const existing = await prisma.billingCode.findUnique({
    where: { id }
  });

  if (!existing) {
    throw new Error('Billing code not found');
  }

  // Organization scoping
  if (existing.organizationId !== requestingUser.organizationId && !requestingUser.isSuperAdmin) {
    throw new Error('Forbidden: You can only update billing codes in your organization');
  }

  // If changing code, check for duplicates
  if (data.code && data.code !== existing.code) {
    const duplicate = await prisma.billingCode.findUnique({
      where: {
        organizationId_code: {
          organizationId: existing.organizationId,
          code: data.code
        }
      }
    });

    if (duplicate) {
      throw new Error('Billing code already exists for this organization');
    }
  }

  // Validate rate if provided
  if (data.rate !== undefined && data.rate <= 0) {
    throw new Error('Billing rate must be greater than zero');
  }

  const billingCode = await prisma.billingCode.update({
    where: { id },
    data: {
      code: data.code,
      description: data.description,
      rate: data.rate,
      category: data.category,
      requiresModifier: data.requiresModifier,
      isActive: data.isActive
    }
  });

  return billingCode;
};

/**
 * Soft delete a billing code by setting isActive = false (Admin only)
 */
export const deleteBillingCode = async (
  id: string,
  requestingUser: JwtPayload
): Promise<BillingCode> => {
  // RBAC: Only admins can delete billing codes
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can delete billing codes');
  }

  // Find existing billing code
  const existing = await prisma.billingCode.findUnique({
    where: { id },
    include: {
      defaultForServiceCodes: true
    }
  });

  if (!existing) {
    throw new Error('Billing code not found');
  }

  // Organization scoping
  if (existing.organizationId !== requestingUser.organizationId && !requestingUser.isSuperAdmin) {
    throw new Error('Forbidden: You can only delete billing codes in your organization');
  }

  // Check if billing code is in use
  if (existing.defaultForServiceCodes.length > 0) {
    throw new Error('Cannot delete billing code that is assigned to service codes. Please unassign it first.');
  }

  // Soft delete by setting isActive = false
  const billingCode = await prisma.billingCode.update({
    where: { id },
    data: { isActive: false }
  });

  return billingCode;
};
