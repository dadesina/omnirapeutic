import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Create Prisma Client that will be shared across all test code AND application code
// By setting it on globalThis, the config/database singleton will reuse this instance
const baseTestPrisma = new PrismaClient();

// HIPAA Compliance: Audit logs must be immutable
// Use Prisma client extensions (Prisma 5+) to prevent updates and deletions
const testPrisma = baseTestPrisma.$extends({
  name: 'auditLogImmutability',
  query: {
    auditLog: {
      async update({ args, query }) {
        throw new Error('Audit logs cannot be modified (HIPAA compliance requirement)');
      },
      async updateMany({ args, query }) {
        throw new Error('Audit logs cannot be modified (HIPAA compliance requirement)');
      },
      async delete({ args, query }) {
        throw new Error('Audit logs cannot be deleted (HIPAA compliance requirement)');
      },
      async deleteMany({ args, query }) {
        if (process.env.NODE_ENV !== 'test') {
          throw new Error('Audit logs cannot be deleted (HIPAA compliance requirement)');
        }
        return query(args);
      },
    },
  },
});

globalThis.prisma = testPrisma as any;

export const prisma = testPrisma;

// Setup: Run before all tests
beforeAll(async () => {
  // Push Prisma schema to test database
  try {
    execSync('npx prisma db push --skip-generate', {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
      stdio: 'ignore',
    });
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }

  // Connect to database
  await prisma.$connect();
});

// Cleanup: Run after each test
afterEach(async () => {
  // Clean up all data between tests in correct order (respecting foreign keys)
  await prisma.auditLog.deleteMany({});
  await prisma.btgAccessGrant.deleteMany({});

  // Clinical data (must be deleted before sessions and treatment plans)
  await prisma.dataPoint.deleteMany({}); // Must delete before goals and progress notes
  await prisma.progressNote.deleteMany({}); // Must delete before sessions and treatment plans

  // Phase 7B.2: Session documentation (must delete before sessions and templates)
  await prisma.sessionDocumentation.deleteMany({}); // Must delete before sessions and templates

  await prisma.sessionEvent.deleteMany({}); // Must delete before sessions
  await prisma.session.deleteMany({}); // Must delete before appointments

  // Goals (must delete before treatment plans)
  await prisma.goal.deleteMany({}); // Must delete before treatment plans

  // Treatment plans (must delete before patients and authorizations)
  await prisma.treatmentPlan.deleteMany({}); // Must delete before patients

  // Appointments and authorizations
  await prisma.appointment.deleteMany({}); // Must delete before patients/practitioners
  await prisma.authorization.deleteMany({}); // Must delete before patients

  await prisma.serviceCode.deleteMany({}); // Must delete before organizations
  await prisma.patientInsurance.deleteMany({}); // Must delete before patients
  await prisma.patient.deleteMany({});
  await prisma.practitioner.deleteMany({});

  // ABA therapy relationships (must delete before users)
  await prisma.supervision.deleteMany({}); // Must delete before users
  await prisma.caregiversClient.deleteMany({}); // Must delete before users
  await prisma.messageParticipant.deleteMany({}); // Must delete before messages
  await prisma.message.deleteMany({}); // Must delete before users
  await prisma.publicationRecipient.deleteMany({}); // Must delete before publications
  await prisma.publication.deleteMany({}); // Must delete before users

  await prisma.user.deleteMany({});

  // Phase 7B.2: Session templates (must delete after sessions but before organizations)
  await prisma.sessionTemplate.deleteMany({}); // Must delete before organizations

  await prisma.organization.deleteMany({}); // Must be last due to foreign keys
});

// Teardown: Run after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Increase timeout for database operations
jest.setTimeout(10000);
