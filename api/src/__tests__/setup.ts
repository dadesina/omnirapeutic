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
  await prisma.patient.deleteMany({});
  await prisma.practitioner.deleteMany({});
  await prisma.user.deleteMany({});
});

// Teardown: Run after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Increase timeout for database operations
jest.setTimeout(10000);
