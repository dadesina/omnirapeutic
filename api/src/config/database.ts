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
const prisma = globalThis.prisma ?? prismaClientSingleton();

// In development, attach to global to survive hot reloads
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed on application termination
 */
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  console.log('Database connection closed');
};

/**
 * Database health check
 * Tests connection to the database
 */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};
