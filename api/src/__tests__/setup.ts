import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Prisma Client will use DATABASE_URL from environment
export const prisma = new PrismaClient();

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
