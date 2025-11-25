/**
 * Authentication Endpoint Tests
 *
 * Tests for user registration, login, and token verification
 * HIPAA Compliance: Validates secure authentication and audit logging
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser, generateExpiredToken, generateInvalidToken } from './helpers/auth.helper';
import { Role } from '@prisma/client';

let app: Application;

describe('Authentication Endpoints', () => {
  beforeAll(async () => {
    // Dynamic import to delay loading until AFTER setup.ts configures test environment
    const { createApp } = await import('../app');
    app = createApp();
  });
  describe('POST /api/auth/register', () => {
    it('should register a new patient user successfully', async () => {
      const userData = {
        email: 'newpatient@test.com',
        password: 'SecurePass123!',
        role: 'PATIENT'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userData.email.toLowerCase());
      expect(response.body.user.role).toBe('PATIENT');
      expect(response.body.user).not.toHaveProperty('password');

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: response.body.user.id,
          action: 'CREATE',
          resource: 'users'
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should register a practitioner user successfully', async () => {
      const userData = {
        email: 'doctor@test.com',
        password: 'SecurePass123!',
        role: 'PRACTITIONER'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.role).toBe('PRACTITIONER');
    });

    it('should default to PATIENT role when role is not specified', async () => {
      const userData = {
        email: 'defaultrole@test.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.role).toBe('PATIENT');
    });

    it('should reject registration with duplicate email', async () => {
      const userData = {
        email: 'duplicate@test.com',
        password: 'SecurePass123!'
      };

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already registered');
    });

    it('should reject registration with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ password: 'SecurePass123!' })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('Email and password are required');
    });

    it('should reject registration with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('Email and password are required');
    });

    it('should reject registration with invalid role', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@test.com',
          password: 'SecurePass123!',
          role: 'INVALID_ROLE'
        })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('Invalid role');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const testUser = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');

      // Verify audit log was created for successful login
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: testUser.id,
          action: 'READ',
          resource: 'auth'
        }
      });
      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'SomePassword123!'
        })
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toContain('Invalid');

      // Verify failed login was audited
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'READ',
          resource: 'auth',
          details: {
            path: ['action'],
            equals: 'login_failed'
          }
        }
      });
      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should reject login with invalid password', async () => {
      const testUser = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject login with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'SomePassword123!' })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('Email and password are required');
    });

    it('should reject login with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com' })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user information with valid token', async () => {
      const testUser = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(testUser.id);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject request with invalid token', async () => {
      const testUser = await createTestUser(Role.PATIENT);
      const invalidToken = generateInvalidToken(testUser.id, testUser.email, testUser.role);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject request with expired token', async () => {
      const testUser = await createTestUser(Role.PATIENT);
      const expiredToken = generateExpiredToken(testUser.id, testUser.email, testUser.role);

      // Wait a moment to ensure token is expired
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject request with malformed token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject request with missing Bearer prefix', async () => {
      const testUser = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', testUser.token)
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });
});
