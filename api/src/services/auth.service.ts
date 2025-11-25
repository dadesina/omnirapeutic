/**
 * Authentication Service
 *
 * Handles user authentication, password hashing, and JWT token management
 * Uses bcrypt for password hashing and jsonwebtoken for JWT tokens
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../config/database';
import { validateEmail, validatePassword } from '../utils/validation';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-replace-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const BCRYPT_ROUNDS = 10;

// JWT Payload Interface
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// User Response Interface (excludes password)
export interface UserResponse {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT token
 */
export const generateToken = (userId: string, email: string, role: Role): string => {
  const payload: JwtPayload = {
    userId,
    email,
    role
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY } as jwt.SignOptions);
};

/**
 * Verify and decode JWT token
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
};

/**
 * Register a new user
 */
export const register = async (
  email: string,
  password: string,
  role: Role = Role.PATIENT
): Promise<{ user: UserResponse; token: string }> => {
  // Validate email format
  if (!validateEmail(email)) {
    throw new Error('Invalid email format');
  }

  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (existingUser) {
    throw new Error('Email already registered');
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      role
    }
  });

  // Generate token
  const token = generateToken(user.id, user.email, user.role);

  // Return user (without password) and token
  const { password: _, ...userResponse } = user;

  return {
    user: userResponse,
    token
  };
};

/**
 * Login user
 */
export const login = async (
  email: string,
  password: string
): Promise<{ user: UserResponse; token: string }> => {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  // Generate token
  const token = generateToken(user.id, user.email, user.role);

  // Return user (without password) and token
  const { password: _, ...userResponse } = user;

  return {
    user: userResponse,
    token
  };
};

/**
 * Get user by ID (for token verification)
 */
export const getUserById = async (userId: string): Promise<UserResponse | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return null;
  }

  const { password: _, ...userResponse } = user;
  return userResponse;
};

/**
 * Refresh token (generate new token for existing user)
 */
export const refreshToken = async (userId: string): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  return generateToken(user.id, user.email, user.role);
};
