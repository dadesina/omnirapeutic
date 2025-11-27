import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from '../setup';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  organizationId: string | null;
  isSuperAdmin: boolean;
  token: string;
  user: {
    userId: string;
    email: string;
    role: Role;
    organizationId: string | null;
    isSuperAdmin: boolean;
  };
}

/**
 * Create a test user with hashed password and JWT token
 * Creates a test organization by default unless isSuperAdmin is true or organizationId is provided
 */
export async function createTestUser(
  role: Role = Role.PATIENT,
  isSuperAdmin: boolean = false,
  existingOrganizationId?: string
): Promise<TestUser> {
  const password = 'Test123!@#';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create organization for non-super-admin users (unless one is provided)
  let organizationId: string | null = null;
  if (!isSuperAdmin) {
    if (existingOrganizationId) {
      organizationId = existingOrganizationId;
    } else {
      const organization = await prisma.organization.create({
        data: {
          name: `Test Clinic ${faker.string.alphanumeric(8)}`,
          type: 'CLINIC',
          status: 'ACTIVE',
          tier: 'TRIAL'
        }
      });
      organizationId = organization.id;
    }
  }

  const user = await prisma.user.create({
    data: {
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      role,
      organizationId,
      isSuperAdmin
    },
  });

  const jwtSecret: string = process.env.JWT_SECRET || 'test-secret';
  const jwtExpiresIn: string = process.env.JWT_EXPIRES_IN || '1h';

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      isSuperAdmin: user.isSuperAdmin
    },
    jwtSecret as jwt.Secret,
    { expiresIn: jwtExpiresIn } as jwt.SignOptions
  );

  return {
    id: user.id,
    email: user.email,
    password, // Return unhashed password for login tests
    role: user.role,
    organizationId: user.organizationId,
    isSuperAdmin: user.isSuperAdmin,
    token,
    user: {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      isSuperAdmin: user.isSuperAdmin
    },
  };
}

/**
 * Convert a raw User object to JwtPayload format
 */
export function userToJwtPayload(user: any): any {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    isSuperAdmin: user.isSuperAdmin,
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
export function generateTestToken(
  userId: string,
  email: string,
  role: Role,
  organizationId: string | null = 'test-org-id',
  isSuperAdmin: boolean = false
): string {
  const jwtSecret: string = process.env.JWT_SECRET || 'test-secret';
  return jwt.sign(
    { userId, email, role, organizationId, isSuperAdmin },
    jwtSecret as jwt.Secret,
    { expiresIn: '1h' } as jwt.SignOptions
  );
}

/**
 * Generate an invalid/expired JWT token for testing
 */
export function generateExpiredToken(
  userId: string,
  email: string,
  role: Role,
  organizationId: string | null = 'test-org-id',
  isSuperAdmin: boolean = false
): string {
  const jwtSecret: string = process.env.JWT_SECRET || 'test-secret';
  return jwt.sign(
    { userId, email, role, organizationId, isSuperAdmin },
    jwtSecret as jwt.Secret,
    { expiresIn: '0s' } as jwt.SignOptions
  );
}

/**
 * Generate a token with invalid signature
 */
export function generateInvalidToken(
  userId: string,
  email: string,
  role: Role,
  organizationId: string | null = 'test-org-id',
  isSuperAdmin: boolean = false
): string {
  return jwt.sign(
    { userId, email, role, organizationId, isSuperAdmin },
    'wrong-secret',
    { expiresIn: '1h' }
  );
}
