/**
 * Database Configuration - Prisma Client Singleton
 *
 * Ensures a single instance of PrismaClient is used throughout the application
 * to avoid exhausting database connections.
 *
 * Reference: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 */

import { PrismaClient } from '@prisma/client';

// Extend global type for Node.js global object
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Initialize Prisma Client with logging configuration
const prismaClientSingleton = () => {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });

  // HIPAA Compliance: Audit logs must be immutable
  // Use Prisma client extensions (Prisma 5+) to prevent updates and deletions
  const client = baseClient.$extends({
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

  return client;
};

// Singleton pattern: reuse existing client in development (hot reload)
// In test environment, use the instance set by test setup
// IMPORTANT: In test mode, NEVER create an instance - only use what setup.ts provides
if (process.env.NODE_ENV === 'test') {
  // Test mode: setup.ts MUST have set globalThis.prisma
  if (!globalThis.prisma) {
    throw new Error('TEST ERROR: globalThis.prisma not set by setup.ts. Check test setup order.');
  }
} else {
  // Production/development: create singleton if needed
  if (!globalThis.prisma) {
    globalThis.prisma = prismaClientSingleton() as any;
  }
}

// Export globalThis.prisma directly (not a proxy)
// TypeScript: Use non-null assertion since we ensure it exists above
export default globalThis.prisma!;

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed on application termination
 */
export const disconnectDatabase = async (): Promise<void> => {
  await globalThis.prisma!.$disconnect();
  console.log('Database connection closed');
};

/**
 * Database health check
 * Tests connection to the database
 */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await globalThis.prisma!.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};
