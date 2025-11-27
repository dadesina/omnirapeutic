/**
 * Appointment Service
 *
 * Handles scheduling and appointment management with integration to authorization unit operations.
 * Critical: All appointment operations must maintain financial integrity via unit tracking.
 */

import { Role, Appointment, AppointmentStatus, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';
import { withRetryMetrics } from '../utils/retry';
import { reserveUnits, releaseUnits, consumeUnits } from './authorization.service';
import { logAuditEvent } from './audit.service';

export interface CreateAppointmentData {
  patientId: string;
  practitionerId: string;
  serviceCodeId: string;
  authorizationId: string;
  startTime: Date;
  endTime: Date;
  notes?: string;
  recurrenceRule?: string;
}

export interface UpdateAppointmentData {
  practitionerId?: string;
  startTime?: Date;
  endTime?: Date;
  notes?: string;
}

export interface AppointmentFilters {
  page?: number;
  limit?: number;
  patientId?: string;
  practitionerId?: string;
  status?: AppointmentStatus;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Calculate units needed based on appointment duration
 */
const calculateUnitsFromDuration = (startTime: Date, endTime: Date): number => {
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  // Assuming 15-minute unit increments (standard for ABA therapy)
  return Math.ceil(durationMinutes / 15);
};

/**
 * Create a new appointment (Admin or Practitioner only)
 * Automatically reserves units from the associated authorization
 */
export const createAppointment = async (
  data: CreateAppointmentData,
  requestingUser: JwtPayload
): Promise<Appointment> => {
  // RBAC: Only Admin or Practitioner can create appointments
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can create appointments');
  }

  // Validate dates
  if (data.endTime <= data.startTime) {
    throw new Error('End time must be after start time');
  }

  // Calculate units needed
  const unitsNeeded = calculateUnitsFromDuration(data.startTime, data.endTime);

  return await withRetryMetrics(async () => {
    return await prisma.$transaction(async (tx) => {
      // 1. Validate patient exists and belongs to same org
      const patient = await tx.patient.findUnique({
        where: { id: data.patientId }
      });

      if (!patient) {
        throw new Error('Patient not found');
      }

      if (!requestingUser.isSuperAdmin && patient.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only create appointments for patients in your organization');
      }

      // 2. Validate practitioner exists and belongs to same org
      const practitioner = await tx.practitioner.findUnique({
        where: { id: data.practitionerId }
      });

      if (!practitioner) {
        throw new Error('Practitioner not found');
      }

      if (!requestingUser.isSuperAdmin && practitioner.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: Practitioner must be in your organization');
      }

      // 3. Validate service code exists
      const serviceCode = await tx.serviceCode.findUnique({
        where: { id: data.serviceCodeId }
      });

      if (!serviceCode) {
        throw new Error('Service code not found');
      }

      // 4. Validate authorization exists
      const authorization = await tx.authorization.findUnique({
        where: { id: data.authorizationId }
      });

      if (!authorization) {
        throw new Error('Authorization not found');
      }

      if (authorization.patientId !== data.patientId) {
        throw new Error('Authorization does not belong to the specified patient');
      }

      // 5. Reserve units (this will fail if insufficient units available)
      await reserveUnits(data.authorizationId, unitsNeeded, requestingUser);

      // 6. Create appointment
      const appointment = await tx.appointment.create({
        data: {
          organizationId: patient.organizationId,
          patientId: data.patientId,
          practitionerId: data.practitionerId,
          serviceCodeId: data.serviceCodeId,
          authorizationId: data.authorizationId,
          startTime: data.startTime,
          endTime: data.endTime,
          notes: data.notes,
          recurrenceRule: data.recurrenceRule,
          status: AppointmentStatus.SCHEDULED
        },
        include: {
          patient: true,
          practitioner: true,
          serviceCode: true,
          authorization: true
        }
      });

      // 7. Audit log
      await logAuditEvent({
        userId: requestingUser.userId,
        action: 'CREATE_APPOINTMENT',
        resource: 'appointment',
        resourceId: appointment.id,
        organizationId: appointment.organizationId,
        details: {
          patientId: appointment.patientId,
          practitionerId: appointment.practitionerId,
          authorizationId: appointment.authorizationId,
          unitsReserved: unitsNeeded,
          startTime: appointment.startTime,
          endTime: appointment.endTime
        }
      });

      return appointment;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
};

/**
 * Get appointment by ID (RBAC enforced)
 */
export const getAppointmentById = async (
  appointmentId: string,
  requestingUser: JwtPayload
): Promise<Appointment> => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true,
      session: true
    }
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  // RBAC checks
  const isSuperAdmin = requestingUser.isSuperAdmin;
  const isAdmin = requestingUser.role === Role.ADMIN;
  const isPractitioner = requestingUser.role === Role.PRACTITIONER;
  const isPatientOwner = appointment.patient.userId === requestingUser.userId;
  const isSameOrg = appointment.organizationId === requestingUser.organizationId;

  // Super Admins can access any appointment
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access appointments in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isPatientOwner) {
      throw new Error('Forbidden: You can only view your own appointments');
    }
  }

  return appointment;
};

/**
 * Get all appointments with filtering and pagination
 */
export const getAllAppointments = async (
  requestingUser: JwtPayload,
  filters: AppointmentFilters = {}
): Promise<{ appointments: Appointment[]; total: number; page: number; limit: number }> => {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  // Organization scoping (non-super admins)
  if (!requestingUser.isSuperAdmin) {
    where.organizationId = requestingUser.organizationId;
  }

  // Patient role can only see their own appointments
  if (requestingUser.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({
      where: { userId: requestingUser.userId }
    });
    if (patient) {
      where.patientId = patient.id;
    }
  }

  // Apply filters
  if (filters.patientId) {
    where.patientId = filters.patientId;
  }

  if (filters.practitionerId) {
    where.practitionerId = filters.practitionerId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.startDate || filters.endDate) {
    where.startTime = {};
    if (filters.startDate) {
      where.startTime.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.startTime.lte = filters.endDate;
    }
  }

  // Execute query
  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        patient: true,
        practitioner: true,
        serviceCode: true,
        authorization: true
      },
      orderBy: [
        { startTime: 'asc' }
      ],
      skip,
      take: limit
    }),
    prisma.appointment.count({ where })
  ]);

  return {
    appointments,
    total,
    page,
    limit
  };
};

/**
 * Update appointment (Admin or Practitioner only)
 * Note: Does not change status - use specific status transition functions
 */
export const updateAppointment = async (
  appointmentId: string,
  data: UpdateAppointmentData,
  requestingUser: JwtPayload
): Promise<Appointment> => {
  // RBAC: Only Admin or Practitioner can update
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can update appointments');
  }

  // Get existing appointment
  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!existingAppointment) {
    throw new Error('Appointment not found');
  }

  // Organization check
  if (!requestingUser.isSuperAdmin && existingAppointment.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only update appointments in your organization');
  }

  // Cannot update completed or cancelled appointments
  if (existingAppointment.status === AppointmentStatus.COMPLETED ||
      existingAppointment.status === AppointmentStatus.CANCELLED) {
    throw new Error('Cannot update completed or cancelled appointments');
  }

  // Validate dates if provided
  const startTime = data.startTime || existingAppointment.startTime;
  const endTime = data.endTime || existingAppointment.endTime;
  if (endTime <= startTime) {
    throw new Error('End time must be after start time');
  }

  // Update appointment
  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data,
    include: {
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true
    }
  });

  // Audit log
  await logAuditEvent({
    userId: requestingUser.userId,
    action: 'UPDATE_APPOINTMENT',
    resource: 'appointment',
    resourceId: updated.id,
    organizationId: updated.organizationId,
    details: { updates: data }
  });

  return updated;
};

/**
 * Cancel appointment (Admin or Practitioner only)
 * Releases reserved units back to the authorization
 */
export const cancelAppointment = async (
  appointmentId: string,
  requestingUser: JwtPayload
): Promise<Appointment> => {
  // RBAC: Only Admin or Practitioner can cancel
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can cancel appointments');
  }

  return await withRetryMetrics(async () => {
    return await prisma.$transaction(async (tx) => {
      // 1. Get appointment
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId }
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Organization check
      if (!requestingUser.isSuperAdmin && appointment.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only cancel appointments in your organization');
      }

      // Cannot cancel already completed or cancelled appointments
      if (appointment.status === AppointmentStatus.COMPLETED) {
        throw new Error('Cannot cancel completed appointment');
      }

      if (appointment.status === AppointmentStatus.CANCELLED) {
        throw new Error('Appointment is already cancelled');
      }

      // 2. Calculate units to release
      const unitsToRelease = calculateUnitsFromDuration(appointment.startTime, appointment.endTime);

      // 3. Release units
      if (appointment.authorizationId) {
        await releaseUnits(appointment.authorizationId, unitsToRelease, requestingUser);
      }

      // 4. Update appointment status
      const cancelled = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CANCELLED },
        include: {
          patient: true,
          practitioner: true,
          serviceCode: true,
          authorization: true
        }
      });

      // 5. Audit log
      await logAuditEvent({
        userId: requestingUser.userId,
        action: 'CANCEL_APPOINTMENT',
        resource: 'appointment',
        resourceId: cancelled.id,
        organizationId: cancelled.organizationId,
        details: {
          unitsReleased: unitsToRelease,
          authorizationId: appointment.authorizationId
        }
      });

      return cancelled;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
};

/**
 * Start appointment (change status to IN_PROGRESS)
 */
export const startAppointment = async (
  appointmentId: string,
  requestingUser: JwtPayload
): Promise<Appointment> => {
  // RBAC: Only Admin or Practitioner
  if (requestingUser.role !== Role.ADMIN && requestingUser.role !== Role.PRACTITIONER) {
    throw new Error('Forbidden: Only administrators and practitioners can start appointments');
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  if (!requestingUser.isSuperAdmin && appointment.organizationId !== requestingUser.organizationId) {
    throw new Error('Forbidden: You can only start appointments in your organization');
  }

  if (appointment.status !== AppointmentStatus.SCHEDULED) {
    throw new Error('Can only start scheduled appointments');
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: AppointmentStatus.IN_PROGRESS },
    include: {
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true
    }
  });

  // Audit log
  await logAuditEvent({
    userId: requestingUser.userId,
    action: 'START_APPOINTMENT',
    resource: 'appointment',
    resourceId: updated.id,
    organizationId: updated.organizationId
  });

  return updated;
};

/**
 * Complete appointment (change status to COMPLETED and create session)
 * This is exported for session service to call
 */
export const markAppointmentComplete = async (
  appointmentId: string,
  requestingUser: JwtPayload
): Promise<Appointment> => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  if (appointment.status === AppointmentStatus.COMPLETED) {
    throw new Error('Appointment is already completed');
  }

  if (appointment.status === AppointmentStatus.CANCELLED) {
    throw new Error('Cannot complete cancelled appointment');
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: AppointmentStatus.COMPLETED },
    include: {
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true
    }
  });

  // Audit log
  await logAuditEvent({
    userId: requestingUser.userId,
    action: 'COMPLETE_APPOINTMENT',
    resource: 'appointment',
    resourceId: updated.id,
    organizationId: updated.organizationId
  });

  return updated;
};
