/**
 * Auth Service Tests
 *
 * Tests for authentication service business logic and edge cases
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import {
  register,
  login,
  getUserById,
  refreshToken,
  verifyToken,
  hashPassword,
  comparePassword
} from '../services/auth.service';

describe('Auth Service', () => {
  describe('register', () => {
    it('should reject registration with invalid email', async () => {
      await expect(
        register('notanemail', 'SecurePass123!', Role.PATIENT)
      ).rejects.toThrow('Invalid email format');
    });

    it('should reject registration with weak password', async () => {
      await expect(
        register('test@example.com', 'weak', Role.PATIENT)
      ).rejects.toThrow('Password validation failed');
    });

    it('should reject registration with duplicate email', async () => {
      const email = 'duplicate@example.com';
      await register(email, 'SecurePass123!', Role.PATIENT);

      await expect(
        register(email, 'SecurePass123!', Role.PATIENT)
      ).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    it('should reject login with non-existent email', async () => {
      await expect(
        login('nonexistent@example.com', 'AnyPassword123!')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject login with incorrect password', async () => {
      await register('testlogin@example.com', 'CorrectPass123!', Role.PATIENT);

      await expect(
        login('testlogin@example.com', 'WrongPass123!')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getUserById', () => {
    it('should return null for non-existent user', async () => {
      const result = await getUserById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('should return user without password field', async () => {
      const { user } = await register('getuser@example.com', 'SecurePass123!', Role.PATIENT);

      const result = await getUserById(user.id);
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('password');
      expect(result?.id).toBe(user.id);
    });
  });

  describe('refreshToken', () => {
    it('should throw error for non-existent user', async () => {
      await expect(
        refreshToken('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('User not found');
    });

    it('should generate new token for existing user', async () => {
      const { user } = await register('refresh@example.com', 'SecurePass123!', Role.PATIENT);

      const newToken = await refreshToken(user.id);
      expect(newToken).toBeTruthy();
      expect(typeof newToken).toBe('string');

      // Verify the new token is valid
      const decoded = verifyToken(newToken);
      expect(decoded.userId).toBe(user.id);
    });
  });

  describe('verifyToken', () => {
    it('should throw error for invalid token format', () => {
      expect(() => verifyToken('invalid.token')).toThrow('Invalid token');
    });

    it('should throw error for malformed token', () => {
      expect(() => verifyToken('not-a-jwt-token')).toThrow();
    });

    it('should successfully decode valid token', async () => {
      const { token, user } = await register('verify@example.com', 'SecurePass123!', Role.PATIENT);

      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.role).toBe(user.role);
    });
  });

  describe('hashPassword and comparePassword', () => {
    it('should hash passwords securely', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20); // Bcrypt hashes are long
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      const isValid = await comparePassword('WrongPassword123!', hash);
      expect(isValid).toBe(false);
    });
  });
});
