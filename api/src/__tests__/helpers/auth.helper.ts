import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';
import { faker } from '../__mocks__/faker.js';

const prisma = new PrismaClient();

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  token: string;
}

/**
 * Create a test user with hashed password and JWT token
 */
export async function createTestUser(role: Role = Role.PATIENT): Promise<TestUser> {
  const password = 'Test123!@#';
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role,
    },
  });

  const jwtSecret: string = process.env.JWT_SECRET || 'test-secret';
  const jwtExpiresIn: string = process.env.JWT_EXPIRES_IN || '1h';

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    jwtSecret as jwt.Secret,
    { expiresIn: jwtExpiresIn } as jwt.SignOptions
  );

  return {
    id: user.id,
    email: user.email,
    password, // Return unhashed password for login tests
    role: user.role,
    token,
  };
}

/**
 * Create multiple test users
 */
export async function createTestUsers(count: number, role?: Role): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 0; i < count; i++) {
    users.push(await createTestUser(role));
  }
  return users;
}

/**
 * Generate a valid JWT token for testing
 */
export function generateTestToken(userId: string, email: string, role: Role): string {
  const jwtSecret: string = process.env.JWT_SECRET || 'test-secret';
  return jwt.sign(
    { userId, email, role },
    jwtSecret as jwt.Secret,
    { expiresIn: '1h' } as jwt.SignOptions
  );
}

/**
 * Generate an invalid/expired JWT token for testing
 */
export function generateExpiredToken(userId: string, email: string, role: Role): string {
  const jwtSecret: string = process.env.JWT_SECRET || 'test-secret';
  return jwt.sign(
    { userId, email, role },
    jwtSecret as jwt.Secret,
    { expiresIn: '0s' } as jwt.SignOptions
  );
}

/**
 * Generate a token with invalid signature
 */
export function generateInvalidToken(userId: string, email: string, role: Role): string {
  return jwt.sign(
    { userId, email, role },
    'wrong-secret',
    { expiresIn: '1h' }
  );
}
