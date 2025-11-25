import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Create Prisma Client that will be shared across all test code AND application code
// By setting it on globalThis, the config/database singleton will reuse this instance
const testPrisma = new PrismaClient();

// HIPAA Compliance: Audit logs must be immutable
// Middleware to prevent updates and deletions of audit logs
testPrisma.$use(async (params, next) => {
  if (params.model === 'AuditLog') {
    if (params.action === 'update' || params.action === 'updateMany') {
      throw new Error('Audit logs cannot be modified (HIPAA compliance requirement)');
    }
    // Block single delete always, but allow deleteMany in test environment for cleanup
    if (params.action === 'delete') {
      throw new Error('Audit logs cannot be deleted (HIPAA compliance requirement)');
    }
    if (params.action === 'deleteMany' && process.env.NODE_ENV !== 'test') {
      throw new Error('Audit logs cannot be deleted (HIPAA compliance requirement)');
    }
  }
  return next(params);
});

globalThis.prisma = testPrisma;

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
