/**
 * Organization Scoping Middleware
 *
 * Enforces multi-tenant data isolation by attaching organization context to requests.
 * Super Admins can bypass organization scoping for platform-level operations.
 *
 * Usage:
 *   - Apply after auth.middleware.ts to ensure req.user exists
 *   - Provides helper functions for organization validation
 *   - Attaches organizationId to request for service layer queries
 */

import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

// Extend Express Request to include organization context
declare global {
  namespace Express {
    interface Request {
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    }
  }
}

/**
 * Organization scoping middleware
 * Attaches organization context from JWT to request
 */
export const organizationScope = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;

    // User must be authenticated (this should be enforced by auth middleware)
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Attach Super Admin flag
    req.isSuperAdmin = user.isSuperAdmin || false;

    // Super Admins can bypass organization scoping
    if (req.isSuperAdmin) {
      req.organizationId = null; // null signals cross-org access allowed
      return next();
    }

    // Regular users MUST have an organizationId
    if (!user.organizationId) {
      res.status(403).json({
        error: 'User not associated with any organization',
        message: 'Please contact your administrator to assign you to an organization'
      });
      return;
    }

    // Attach organization context to request
    req.organizationId = user.organizationId;
    next();
  } catch (error) {
    console.error('Organization scoping error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Helper: Check if requesting user is a Super Admin
 */
export const isSuperAdmin = (req: Request): boolean => {
  return req.isSuperAdmin === true;
};

/**
 * Helper: Get requesting user's organization ID
 * Returns null for Super Admins
 */
export const getUserOrganizationId = (req: Request): string | null => {
  return req.organizationId || null;
};

/**
 * Helper: Check if a resource belongs to the same organization as the requesting user
 * Super Admins always pass this check
 */
export const isSameOrganization = (req: Request, resourceOrganizationId: string | null): boolean => {
  // Super Admins can access any organization
  if (isSuperAdmin(req)) {
    return true;
  }

  // Regular users can only access resources in their organization
  return req.organizationId === resourceOrganizationId;
};

/**
 * Helper: Validate organization access and throw error if unauthorized
 * Use this in service methods before accessing resources
 */
export const validateOrganizationAccess = (
  req: Request,
  resourceOrganizationId: string | null,
  resourceType: string = 'resource'
): void => {
  if (!isSameOrganization(req, resourceOrganizationId)) {
    throw new Error(
      `Access denied: You do not have permission to access this ${resourceType} from another organization`
    );
  }
};

/**
 * Helper: Build Prisma where clause with organization scoping
 * Automatically adds organizationId filter unless user is Super Admin
 */
export const buildOrgScopedWhere = (req: Request, additionalWhere: any = {}): any => {
  const where = { ...additionalWhere };

  // Super Admins see all organizations
  if (isSuperAdmin(req)) {
    return where;
  }

  // Regular users only see their organization
  where.organizationId = req.organizationId;
  return where;
};

/**
 * Middleware: Require ADMIN role within organization
 * Use this for organization management endpoints
 */
export const requireOrgAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Super Admins always pass
  if (user.isSuperAdmin) {
    return next();
  }

  // Check if user is ADMIN role
  if (user.role !== Role.ADMIN) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Only organization administrators can perform this action'
    });
    return;
  }

  next();
};

/**
 * Middleware: Require Super Admin (platform-level admin)
 * Use this for platform management endpoints
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!user.isSuperAdmin) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Only platform administrators can perform this action'
    });
    return;
  }

  next();
};
