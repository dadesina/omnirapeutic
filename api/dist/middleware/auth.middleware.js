"use strict";
/**
 * Authentication Middleware
 *
 * Provides middleware functions for route protection and role-based access control (RBAC)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOwner = exports.isPatient = exports.isPractitioner = exports.isAdmin = exports.optionalAuth = exports.requireRole = exports.authenticateToken = void 0;
const client_1 = require("@prisma/client");
const auth_service_1 = require("../services/auth.service");
/**
 * Extract token from Authorization header
 * Format: "Bearer <token>"
 */
const extractToken = (req) => {
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
const authenticateToken = (req, res, next) => {
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
        const decoded = (0, auth_service_1.verifyToken)(token);
        // Attach user to request
        req.user = decoded;
        next();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid token';
        res.status(401).json({
            error: 'Unauthorized',
            message
        });
    }
};
exports.authenticateToken = authenticateToken;
/**
 * Require role middleware factory
 * Returns middleware that checks if authenticated user has one of the required roles
 * Returns 403 if user doesn't have required role
 *
 * Usage:
 *   router.get('/admin', authenticateToken, requireRole([Role.ADMIN]), handler)
 */
const requireRole = (roles) => {
    return (req, res, next) => {
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
exports.requireRole = requireRole;
/**
 * Optional authentication middleware
 * Validates token if present, but allows unauthenticated requests
 * Useful for endpoints that behave differently for authenticated vs unauthenticated users
 */
const optionalAuth = (req, res, next) => {
    try {
        const token = extractToken(req);
        if (token) {
            // Token present, verify it
            const decoded = (0, auth_service_1.verifyToken)(token);
            req.user = decoded;
        }
        // Continue regardless of token presence
        next();
    }
    catch (error) {
        // Invalid token, but optional auth - continue without user
        next();
    }
};
exports.optionalAuth = optionalAuth;
/**
 * Check if user is admin
 * Helper function for use in route handlers
 */
const isAdmin = (req) => {
    return req.user?.role === client_1.Role.ADMIN;
};
exports.isAdmin = isAdmin;
/**
 * Check if user is practitioner
 * Helper function for use in route handlers
 */
const isPractitioner = (req) => {
    return req.user?.role === client_1.Role.PRACTITIONER;
};
exports.isPractitioner = isPractitioner;
/**
 * Check if user is patient
 * Helper function for use in route handlers
 */
const isPatient = (req) => {
    return req.user?.role === client_1.Role.PATIENT;
};
exports.isPatient = isPatient;
/**
 * Check if user owns a resource
 * Compares authenticated user ID with resource user ID
 */
const isOwner = (req, resourceUserId) => {
    return req.user?.userId === resourceUserId;
};
exports.isOwner = isOwner;
