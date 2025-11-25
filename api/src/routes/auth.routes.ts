/**
 * Authentication Routes
 *
 * Handles user registration, login, and token verification endpoints
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { register, login, getUserById } from '../services/auth.service';
import { authenticateToken } from '../middleware/auth.middleware';
import prisma from '../config/database';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 *
 * Body: { email, password, role? }
 * Response: { user, token }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
      return;
    }

    // Validate role if provided
    if (role && !Object.values(Role).includes(role)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid role. Must be ADMIN, PRACTITIONER, or PATIENT'
      });
      return;
    }

    // Register user
    const result = await register(email, password, role);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: result.user.id,
        action: 'CREATE',
        resource: 'users',
        resourceId: result.user.id,
        details: { email: result.user.email, role: result.user.role },
        ipAddress: req.ip
      }
    });

    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';

    // Handle specific error cases
    if (message.includes('already registered')) {
      res.status(409).json({
        error: 'Conflict',
        message
      });
      return;
    }

    if (message.includes('validation failed') || message.includes('Invalid email')) {
      res.status(400).json({
        error: 'Bad Request',
        message
      });
      return;
    }

    // Generic error
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Registration failed'
    });
  }
});

/**
 * POST /api/auth/login
 * Login user and get JWT token
 *
 * Body: { email, password }
 * Response: { user, token }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
      return;
    }

    // Login user
    const result = await login(email, password);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: result.user.id,
        action: 'READ',
        resource: 'auth',
        resourceId: result.user.id,
        details: { action: 'login', email: result.user.email },
        ipAddress: req.ip
      }
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';

    // Log failed login attempt
    await prisma.auditLog.create({
      data: {
        action: 'READ',
        resource: 'auth',
        details: { action: 'login_failed', email: req.body.email, error: message },
        ipAddress: req.ip
      }
    });

    if (message.includes('Invalid credentials')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
      return;
    }

    // Generic error
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information (requires authentication)
 *
 * Headers: Authorization: Bearer <token>
 * Response: { user }
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    // Get user from database
    const user = await getUserById(req.user.userId);

    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user information'
    });
  }
});

export default router;
