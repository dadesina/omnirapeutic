/**
 * Authentication Middleware
 *
 * Provides middleware functions for route protection and role-based access control (RBAC)
 */

import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyToken, JwtPayload } from '../services/auth.service';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Extract token from Authorization header
 * Format: "Bearer <token>"
 */
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Authenticate token middleware
 * Verifies JWT token and attaches user to request
 * Returns 401 if token is missing or invalid
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required'
      });
      return;
    }

    // Verify token
    const decoded = verifyToken(token);

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    res.status(401).json({
      error: 'Unauthorized',
      message
    });
  }
};

/**
 * Require role middleware factory
 * Returns middleware that checks if authenticated user has one of the required roles
 * Returns 403 if user doesn't have required role
 *
 * Usage:
 *   router.get('/admin', authenticateToken, requireRole([Role.ADMIN]), handler)
 */
export const requireRole = (roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // User must be authenticated first (should use authenticateToken before this)
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    // Check if user has one of the required roles
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Validates token if present, but allows unauthenticated requests
 * Useful for endpoints that behave differently for authenticated vs unauthenticated users
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req);

    if (token) {
      // Token present, verify it
      const decoded = verifyToken(token);
      req.user = decoded;
    }

    // Continue regardless of token presence
    next();
  } catch (error) {
    // Invalid token, but optional auth - continue without user
    next();
  }
};

/**
 * Check if user is admin
 * Helper function for use in route handlers
 */
export const isAdmin = (req: Request): boolean => {
  return req.user?.role === Role.ADMIN;
};

/**
 * Check if user is practitioner
 * Helper function for use in route handlers
 */
export const isPractitioner = (req: Request): boolean => {
  return req.user?.role === Role.PRACTITIONER;
};

/**
 * Check if user is patient
 * Helper function for use in route handlers
 */
export const isPatient = (req: Request): boolean => {
  return req.user?.role === Role.PATIENT;
};

/**
 * Check if user owns a resource
 * Compares authenticated user ID with resource user ID
 */
export const isOwner = (req: Request, resourceUserId: string): boolean => {
  return req.user?.userId === resourceUserId;
};
