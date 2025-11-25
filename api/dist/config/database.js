"use strict";
/**
 * Database Configuration - Prisma Client Singleton
 *
 * Ensures a single instance of PrismaClient is used throughout the application
 * to avoid exhausting database connections.
 *
 * Reference: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDatabaseConnection = exports.disconnectDatabase = void 0;
const client_1 = require("@prisma/client");
// Initialize Prisma Client with logging configuration
const prismaClientSingleton = () => {
    return new client_1.PrismaClient({
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
exports.default = prisma;
/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed on application termination
 */
const disconnectDatabase = async () => {
    await prisma.$disconnect();
    console.log('Database connection closed');
};
exports.disconnectDatabase = disconnectDatabase;
/**
 * Database health check
 * Tests connection to the database
 */
const checkDatabaseConnection = async () => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch (error) {
        console.error('Database connection failed:', error);
        return false;
    }
};
exports.checkDatabaseConnection = checkDatabaseConnection;
