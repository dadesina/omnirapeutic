import { PrismaClient, Role } from '@prisma/client';
import { faker } from '../__mocks__/faker';

const prisma = new PrismaClient();

/**
 * Factory for creating test Patient records
 * IMPORTANT: All data is anonymized/fake - NEVER use real PHI
 */
export async function createTestPatient(userId: string) {
  return await prisma.patient.create({
    data: {
      userId,
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
export async function createTestPractitioner(userId: string) {
  return await prisma.practitioner.create({
    data: {
      userId,
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
export async function createCompleteTestPatient(password: string = 'Test123!@#') {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role: Role.PATIENT,
    },
  });

  const patient = await createTestPatient(user.id);

  return { user, patient, password };
}

/**
 * Create a complete test practitioner with user account
 */
export async function createCompleteTestPractitioner(password: string = 'Test123!@#') {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role: Role.PRACTITIONER,
    },
  });

  const practitioner = await createTestPractitioner(user.id);

  return { user, practitioner, password };
}
