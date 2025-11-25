/**
 * Patient Service
 *
 * Handles all Patient-related business logic with RBAC enforcement
 * All PHI access is logged for HIPAA compliance
 */

import { Role, Patient } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';

export interface CreatePatientData {
  userId: string;
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

  // Validate date of birth is in the past
  if (new Date(data.dateOfBirth) > new Date()) {
    throw new Error('Date of birth must be in the past');
  }

  // Create patient
  const patient = await prisma.patient.create({
    data: {
      userId: data.userId,
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
  const where = filters.search
    ? {
        OR: [
          { firstName: { contains: filters.search, mode: 'insensitive' as const } },
          { lastName: { contains: filters.search, mode: 'insensitive' as const } },
          { medicalRecordNumber: { contains: filters.search, mode: 'insensitive' as const } }
        ]
      }
    : {};

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
 * - Admin: can view any patient
 * - Practitioner: can view any patient
 * - Patient: can only view own record
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
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isOwner = patient.userId === requestingUser.userId;

  if (!isAdmin && !isPractitioner && !isOwner) {
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
