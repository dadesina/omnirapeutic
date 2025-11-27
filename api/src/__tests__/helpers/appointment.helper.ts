/**
 * Appointment Test Helpers
 *
 * Helper functions for creating appointments in tests
 */

import { Appointment, AppointmentStatus, Authorization, ServiceCode } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from '../setup';
import { JwtPayload } from '../../services/auth.service';
import { CreateAppointmentData } from '../../services/appointment.service';

/**
 * Consistent test dates to avoid time-dependent failures
 */
export const testDate = {
  now: new Date('2025-11-27T09:00:00Z'),
  oneHourLater: new Date('2025-11-27T10:00:00Z'),
  twoHoursLater: new Date('2025-11-27T11:00:00Z'),
  tomorrow: new Date('2025-11-28T09:00:00Z'),
  nextWeek: new Date('2025-12-04T09:00:00Z'),
};

/**
 * Common duration constants (in milliseconds)
 */
export const durations = {
  fifteenMinutes: 15 * 60 * 1000,
  thirtyMinutes: 30 * 60 * 1000,
  oneHour: 60 * 60 * 1000,
  twoHours: 120 * 60 * 1000,
};

/**
 * Calculate expected units based on duration
 * Matches the logic in appointment.service.ts
 */
export const calculateExpectedUnits = (startTime: Date, endTime: Date): number => {
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  return Math.ceil(durationMinutes / 15); // 15-minute increments
};

/**
 * Default values for test appointments
 */
export function appointmentDefaults(): Partial<CreateAppointmentData> {
  return {
    startTime: testDate.now,
    endTime: testDate.oneHourLater,
    notes: 'Test appointment notes',
  };
}

/**
 * Create test authorization with sufficient units
 */
export async function createTestAuthorization(options: {
  patientId: string;
  serviceCodeId: string;
  organizationId: string;
  totalUnits?: number;
  authNumber?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Authorization> {
  return await prisma.authorization.create({
    data: {
      organizationId: options.organizationId,
      patientId: options.patientId,
      serviceCodeId: options.serviceCodeId,
      authNumber: options.authNumber || `AUTH-${faker.string.alphanumeric(8).toUpperCase()}`,
      totalUnits: options.totalUnits || 100,
      scheduledUnits: 0,
      usedUnits: 0,
      startDate: options.startDate || new Date('2025-01-01'),
      endDate: options.endDate || new Date('2025-12-31'),
      status: 'ACTIVE',
    },
  });
}

/**
 * Create test service code
 */
export async function createTestServiceCode(organizationId: string): Promise<ServiceCode> {
  return await prisma.serviceCode.create({
    data: {
      organizationId,
      code: `97153-${faker.string.alphanumeric(6)}`,
      description: 'Adaptive behavior treatment by protocol',
      category: 'TREATMENT',
      requiredCredentials: ['RBT', 'BCBA'],
      typicalDuration: 60,
      isActive: true,
    },
  });
}

/**
 * Create appointment data object (doesn't persist to DB)
 * Useful for testing service functions directly
 */
export async function createTestAppointmentData(
  options: {
    patientId: string;
    practitionerId: string;
    serviceCodeId: string;
    authorizationId: string;
    organizationId?: string;
    startTime?: Date;
    endTime?: Date;
    notes?: string;
  }
): Promise<CreateAppointmentData> {
  const defaults = appointmentDefaults();

  return {
    patientId: options.patientId,
    practitionerId: options.practitionerId,
    serviceCodeId: options.serviceCodeId,
    authorizationId: options.authorizationId,
    startTime: options.startTime || defaults.startTime!,
    endTime: options.endTime || defaults.endTime!,
    notes: options.notes || defaults.notes,
  };
}

/**
 * Create a complete test appointment with all dependencies
 * This creates: Patient, Practitioner, ServiceCode, Authorization, and Appointment
 */
export async function createTestAppointment(options?: {
  organizationId?: string;
  patientId?: string;
  practitionerId?: string;
  serviceCodeId?: string;
  authorizationId?: string;
  startTime?: Date;
  endTime?: Date;
  status?: AppointmentStatus;
  notes?: string;
  totalUnits?: number; // For authorization
}): Promise<Appointment> {
  const defaults = appointmentDefaults();

  // Determine organization
  let organizationId = options?.organizationId;
  if (!organizationId) {
    const org = await prisma.organization.create({
      data: {
        name: `Test Clinic ${faker.string.alphanumeric(8)}`,
        type: 'CLINIC',
        status: 'ACTIVE',
        tier: 'TRIAL',
      },
    });
    organizationId = org.id;
  }

  // Create or use patient
  let patientId = options?.patientId;
  if (!patientId) {
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);

    const patientUser = await prisma.user.create({
      data: {
        email: faker.internet.email().toLowerCase(),
        password: hashedPassword,
        role: 'PATIENT',
        organizationId,
        isSuperAdmin: false,
      },
    });

    const patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        organizationId,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        dateOfBirth: faker.date.birthdate({ min: 18, max: 90, mode: 'age' }),
        medicalRecordNumber: `MRN-${faker.string.alphanumeric(8).toUpperCase()}`,
        phoneNumber: faker.phone.number(),
        address: faker.location.streetAddress(true),
      },
    });
    patientId = patient.id;
  }

  // Create or use practitioner
  let practitionerId = options?.practitionerId;
  if (!practitionerId) {
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);

    const practitionerUser = await prisma.user.create({
      data: {
        email: faker.internet.email().toLowerCase(),
        password: hashedPassword,
        role: 'PRACTITIONER',
        organizationId,
        isSuperAdmin: false,
      },
    });

    const practitioner = await prisma.practitioner.create({
      data: {
        userId: practitionerUser.id,
        organizationId,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        licenseNumber: `LIC-${faker.string.alphanumeric(10).toUpperCase()}`,
        specialization: 'ABA Therapy',
        phoneNumber: faker.phone.number(),
      },
    });
    practitionerId = practitioner.id;
  }

  // Create or use service code
  let serviceCodeId = options?.serviceCodeId;
  if (!serviceCodeId) {
    const serviceCode = await createTestServiceCode(organizationId);
    serviceCodeId = serviceCode.id;
  }

  // Create or use authorization
  let authorizationId = options?.authorizationId;
  if (!authorizationId) {
    const authorization = await createTestAuthorization({
      patientId,
      serviceCodeId,
      organizationId,
      totalUnits: options?.totalUnits || 100,
    });
    authorizationId = authorization.id;
  }

  // Calculate units needed for this appointment
  const startTime = options?.startTime || defaults.startTime!;
  const endTime = options?.endTime || defaults.endTime!;
  const unitsNeeded = calculateExpectedUnits(startTime, endTime);

  // Reserve units from authorization if not already reserved
  if (!options?.authorizationId) {
    await prisma.authorization.update({
      where: { id: authorizationId },
      data: {
        scheduledUnits: { increment: unitsNeeded },
      },
    });
  }

  // Create appointment
  const appointment = await prisma.appointment.create({
    data: {
      organizationId,
      patientId,
      practitionerId,
      serviceCodeId,
      authorizationId,
      startTime,
      endTime,
      status: options?.status || AppointmentStatus.SCHEDULED,
      notes: options?.notes || defaults.notes,
    },
    include: {
      patient: true,
      practitioner: true,
      serviceCode: true,
      authorization: true,
    },
  });

  return appointment;
}

/**
 * Create multiple appointments for pagination/filtering tests
 */
export async function createMultipleAppointments(
  count: number,
  options?: {
    organizationId?: string;
    patientId?: string;
    practitionerId?: string;
    status?: AppointmentStatus;
    startDate?: Date;
  }
): Promise<Appointment[]> {
  const appointments: Appointment[] = [];

  for (let i = 0; i < count; i++) {
    const startTime = options?.startDate
      ? new Date(options.startDate.getTime() + i * durations.twoHours)
      : new Date(testDate.now.getTime() + i * durations.twoHours);

    const endTime = new Date(startTime.getTime() + durations.oneHour);

    const appointment = await createTestAppointment({
      ...options,
      startTime,
      endTime,
    });

    appointments.push(appointment);
  }

  return appointments;
}
