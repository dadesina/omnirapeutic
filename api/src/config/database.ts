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
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });
};

// Singleton pattern: reuse existing client in development (hot reload)
// In test environment, use the instance set by test setup
// IMPORTANT: Always use globalThis.prisma directly - never cache in local variable
// This ensures test setup can inject its instance before any imports
if (!globalThis.prisma) {
  globalThis.prisma = prismaClientSingleton();
}

// Create a proxy that always references globalThis.prisma dynamically
// This prevents caching the instance at module load time
const prismaProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalThis.prisma) {
      throw new Error('Prisma client not initialized');
    }
    return (globalThis.prisma as any)[prop];
  }
});

export default prismaProxy;

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
