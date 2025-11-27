import { Role } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from '../setup';

/**
 * Factory for creating test Patient records
 * IMPORTANT: All data is anonymized/fake - NEVER use real PHI
 */
export async function createTestPatient(userId: string, organizationId: string) {
  return await prisma.patient.create({
    data: {
      userId,
      organizationId,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      dateOfBirth: faker.date.birthdate({ min: 18, max: 90, mode: 'age' }),
      medicalRecordNumber: `MRN-${faker.string.alphanumeric(8).toUpperCase()}`,
      phoneNumber: faker.phone.number(),
      address: faker.location.streetAddress(true),
    },
  });
}

/**
 * Factory for creating test Practitioner records
 */
export async function createTestPractitioner(userId: string, organizationId: string) {
  return await prisma.practitioner.create({
    data: {
      userId,
      organizationId,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      licenseNumber: `LIC-${faker.string.alphanumeric(10).toUpperCase()}`,
      specialization: faker.helpers.arrayElement([
        'Cardiology',
        'Neurology',
        'Pediatrics',
        'Oncology',
        'General Practice',
      ]),
      phoneNumber: faker.phone.number(),
    },
  });
}

/**
 * Factory for creating test audit log entries
 */
export async function createTestAuditLog(userId: string, action: string, resource: string) {
  return await prisma.auditLog.create({
    data: {
      userId,
      action,
      resource,
      resourceId: faker.string.uuid(),
      details: {
        timestamp: new Date().toISOString(),
        test: true,
      },
      ipAddress: faker.internet.ipv4(),
    },
  });
}

/**
 * Create a complete test patient with user account
 */
export async function createCompleteTestPatient(password: string = 'Test123!@#', existingOrganizationId?: string) {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create organization for patient (unless one is provided)
  let organizationId: string;
  if (existingOrganizationId) {
    organizationId = existingOrganizationId;
  } else {
    const organization = await prisma.organization.create({
      data: {
        name: `Test Clinic ${faker.string.alphanumeric(8)}`,
        type: 'CLINIC',
        status: 'ACTIVE',
        tier: 'TRIAL'
      }
    });
    organizationId = organization.id;
  }

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role: Role.PATIENT,
      organizationId,
      isSuperAdmin: false
    },
  });

  const patient = await createTestPatient(user.id, organizationId);

  return { user, patient, password };
}

/**
 * Create a complete test practitioner with user account
 */
export async function createCompleteTestPractitioner(password: string = 'Test123!@#', existingOrganizationId?: string) {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create organization for practitioner (unless one is provided)
  let organizationId: string;
  if (existingOrganizationId) {
    organizationId = existingOrganizationId;
  } else {
    const organization = await prisma.organization.create({
      data: {
        name: `Test Clinic ${faker.string.alphanumeric(8)}`,
        type: 'CLINIC',
        status: 'ACTIVE',
        tier: 'TRIAL'
      }
    });
    organizationId = organization.id;
  }

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role: Role.PRACTITIONER,
      organizationId,
      isSuperAdmin: false
    },
  });

  const practitioner = await createTestPractitioner(user.id, organizationId);

  return { user, practitioner, password };
}

/**
 * Create a complete test admin with user account
 */
export async function createCompleteTestAdmin(password: string = 'Test123!@#') {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create organization for admin
  const organization = await prisma.organization.create({
    data: {
      name: `Test Clinic ${faker.string.alphanumeric(8)}`,
      type: 'CLINIC',
      status: 'ACTIVE',
      tier: 'TRIAL'
    }
  });

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role: Role.ADMIN,
      organizationId: organization.id,
      isSuperAdmin: false
    },
  });

  return { user, password };
}
