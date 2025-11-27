/**
 * Patient Service
 *
 * Handles all Patient-related business logic with RBAC enforcement
 * All PHI access is logged for HIPAA compliance
 */

import { Role, Patient } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';
import { hasActiveBtgAccess } from './btg.service';

export interface CreatePatientData {
  userId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  medicalRecordNumber: string;
  phoneNumber?: string;
  address?: string;
}

export interface UpdatePatientData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  phoneNumber?: string;
  address?: string;
}

export interface PatientFilters {
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Create a new patient (Admin only)
 */
export const createPatient = async (
  data: CreatePatientData,
  requestingUser: JwtPayload
): Promise<Patient> => {
  // RBAC: Only admins can create patients
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can create patients');
  }

  // Organization scoping: Regular admins can only create patients in their org
  // Super Admins must explicitly provide organizationId
  if (!requestingUser.isSuperAdmin && data.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only create patients in your own organization');
  }

  // Validate date of birth is in the past
  if (new Date(data.dateOfBirth) > new Date()) {
    throw new Error('Date of birth must be in the past');
  }

  // Validate that the user belongs to the same organization
  const user = await prisma.user.findUnique({
    where: { id: data.userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.organizationId !== data.organizationId) {
    throw new Error('User must belong to the same organization as the patient');
  }

  // Check for duplicate MRN within the organization
  const existingPatient = await prisma.patient.findFirst({
    where: {
      organizationId: data.organizationId,
      medicalRecordNumber: data.medicalRecordNumber
    }
  });

  if (existingPatient) {
    throw new Error('Medical record number already exists in this organization');
  }

  // Create patient
  const patient = await prisma.patient.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: new Date(data.dateOfBirth),
      medicalRecordNumber: data.medicalRecordNumber,
      phoneNumber: data.phoneNumber,
      address: data.address
    }
  });

  return patient;
};

/**
 * Get all patients with pagination (Admin and Practitioner)
 */
export const getAllPatients = async (
  requestingUser: JwtPayload,
  filters: PatientFilters = {}
): Promise<{ patients: Patient[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
  // RBAC: Only admins and practitioners can view all patients
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
          { firstName: { contains: filters.search, mode: 'insensitive' as const } },
          { lastName: { contains: filters.search, mode: 'insensitive' as const } },
          { medicalRecordNumber: { contains: filters.search, mode: 'insensitive' as const } }
        ]
      }
    : {};

  // Organization scoping: Super Admins see all orgs, regular users see only their org
  const where: any = { ...searchWhere };
  if (!requestingUser.isSuperAdmin) {
    where.organizationId = requestingUser.organizationId;
  }

  // Get patients with pagination
  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.patient.count({ where })
  ]);

  return {
    patients,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get patient by ID with RBAC
 * - Super Admin: can view any patient in any organization
 * - Admin: can view patients in their organization
 * - Practitioner: can view patients in their organization
 * - Patient: can only view own record
 * - BTG Grant: ADMIN with active Break-the-Glass grant can view patient
 */
export const getPatientById = async (
  patientId: string,
  requestingUser: JwtPayload
): Promise<Patient> => {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC: Check permissions
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isOwner = patient.userId === requestingUser.userId;
  const isSameOrg = patient.organizationId === requestingUser.organizationId;

  // BTG: Check for active Break-the-Glass emergency access grant
  const hasEmergencyAccess = await hasActiveBtgAccess(requestingUser.userId, patientId);

  // Super Admins can access any patient
  if (isSuperAdmin) {
    return patient;
  }

  // Organization boundary check: Users can only access patients in their org
  if (!isSameOrg && !hasEmergencyAccess) {
    throw new Error('Forbidden: You can only access patients in your organization');
  }

  // Role-based checks within organization
  if (!isAdmin && !isPractitioner && !isOwner && !hasEmergencyAccess) {
    throw new Error('Forbidden: You can only view your own patient record');
  }

  return patient;
};

/**
 * Update patient (Admin only)
 */
export const updatePatient = async (
  patientId: string,
  data: UpdatePatientData,
  requestingUser: JwtPayload
): Promise<Patient> => {
  // RBAC: Only admins can update patients
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can update patients');
  }

  // Check if patient exists
  const existingPatient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!existingPatient) {
    throw new Error('Patient not found');
  }

  // Organization boundary check: Regular admins can only update patients in their org
  if (!requestingUser.isSuperAdmin && existingPatient.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only update patients in your organization');
  }

  // Validate date of birth if provided
  if (data.dateOfBirth && new Date(data.dateOfBirth) > new Date()) {
    throw new Error('Date of birth must be in the past');
  }

  // Update patient
  const updatedPatient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      phoneNumber: data.phoneNumber,
      address: data.address
    }
  });

  return updatedPatient;
};

/**
 * Delete patient (Admin only)
 */
export const deletePatient = async (
  patientId: string,
  requestingUser: JwtPayload
): Promise<void> => {
  // RBAC: Only admins can delete patients
  if (requestingUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can delete patients');
  }

  // Check if patient exists
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Organization boundary check: Regular admins can only delete patients in their org
  if (!requestingUser.isSuperAdmin && patient.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only delete patients in your organization');
  }

  // Delete patient (cascade will handle user deletion if configured)
  await prisma.patient.delete({
    where: { id: patientId }
  });
};

/**
 * Get patient by user ID
 * Used to check if a user already has a patient profile
 */
export const getPatientByUserId = async (userId: string): Promise<Patient | null> => {
  return await prisma.patient.findUnique({
    where: { userId }
  });
};
