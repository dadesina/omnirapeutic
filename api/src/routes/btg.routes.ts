/**
 * Break-the-Glass (BTG) Routes
 *
 * Admin-only emergency access endpoints
 * HIPAA § 164.308(a)(4)(ii)(C) - Emergency Access Procedure
 *
 * Security: JWT + ADMIN role + MFA requirement
 */

import express, { Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import {
  createBtgGrant,
  revokeBtgGrant,
  getActiveBtgGrants,
  ALLOWED_DURATIONS,
  CreateBtgGrantRequest,
} from '../services/btg.service';

const router = express.Router();

/**
 * POST /api/admin/btg/grants
 *
 * Create a BTG emergency access grant
 *
 * Security Requirements:
 * - JWT authentication
 * - ADMIN role
 * - MFA-authenticated session (checked via JWT amr claim)
 *
 * Request Body:
 * {
 *   "grantedToUserId": "uuid",
 *   "patientId": "uuid",
 *   "justification": "Detailed reason (min 25 chars)",
 *   "durationMinutes": 30 | 60 | 120 | 240 | 480
 * }
 *
 * Response 201:
 * {
 *   "success": true,
 *   "grantId": "uuid",
 *   "expiresAt": "2025-11-25T22:30:00Z",
 *   "message": "Emergency access granted for 120 minutes"
 * }
 */
router.post(
  '/grants',
  authenticateToken,
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { grantedToUserId, patientId, justification, durationMinutes } =
        req.body;

      // Validate required fields
      if (!grantedToUserId || !patientId || !justification || !durationMinutes) {
        return res.status(400).json({
          error: 'Bad Request',
          message:
            'Missing required fields: grantedToUserId, patientId, justification, durationMinutes',
        });
      }

      // Validate types
      if (
        typeof grantedToUserId !== 'string' ||
        typeof patientId !== 'string' ||
        typeof justification !== 'string' ||
        typeof durationMinutes !== 'number'
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid field types',
        });
      }

      // Create the request object
      const grantRequest: CreateBtgGrantRequest = {
        grantedToUserId,
        patientId,
        justification: justification.trim(),
        durationMinutes: durationMinutes as any, // Type validated by service layer
      };

      // Get client IP address
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';

      // Create the grant
      const grant = await createBtgGrant(
        grantRequest,
        req.user!,
        ipAddress
      );

      // TODO: Trigger CloudWatch alarm for BTG grant
      // This will be implemented in the alerting task

      res.status(201).json(grant);
    } catch (error: any) {
      // Handle specific errors
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (
        error.message.includes('Invalid') ||
        error.message.includes('Justification') ||
        error.message.includes('does not exist')
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      // Log unexpected errors
      console.error('BTG grant creation error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create BTG access grant',
      });
    }
  }
);

/**
 * POST /api/admin/btg/grants/:grantId/revoke
 *
 * Revoke a BTG grant before it expires
 *
 * Security: JWT + ADMIN role
 *
 * Request Body:
 * {
 *   "reason": "Grant no longer needed"
 * }
 *
 * Response 200:
 * {
 *   "success": true,
 *   "message": "Emergency access revoked successfully"
 * }
 */
router.post(
  '/grants/:grantId/revoke',
  authenticateToken,
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { grantId } = req.params;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Revocation reason is required',
        });
      }

      if (reason.trim().length < 10) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Revocation reason must be at least 10 characters',
        });
      }

      // Get client IP address
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';

      const result = await revokeBtgGrant(
        grantId,
        reason.trim(),
        req.user!,
        ipAddress
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (
        error.message.includes('already revoked') ||
        error.message.includes('already expired')
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      console.error('BTG grant revocation error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to revoke BTG access grant',
      });
    }
  }
);

/**
 * GET /api/admin/btg/grants?status=active
 *
 * List all active BTG grants
 *
 * Security: JWT + ADMIN role
 *
 * Query Parameters:
 * - status: 'active' (currently only active grants supported)
 *
 * Response 200:
 * {
 *   "grants": [
 *     {
 *       "id": "uuid",
 *       "grantedByUserId": "uuid",
 *       "grantedToUserId": "uuid",
 *       "patientId": "uuid",
 *       "justification": "...",
 *       "durationMinutes": 120,
 *       "expiresAt": "2025-11-25T22:30:00Z",
 *       "createdAt": "2025-11-25T20:30:00Z",
 *       "grantedByUser": { "email": "admin1@example.com" },
 *       "grantedToUser": { "email": "admin2@example.com" },
 *       "patient": {
 *         "firstName": "John",
 *         "lastName": "Doe",
 *         "medicalRecordNumber": "MRN123"
 *       }
 *     }
 *   ],
 *   "count": 1
 * }
 */
router.get(
  '/grants',
  authenticateToken,
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { status } = req.query;

      // Currently only support active grants
      if (status && status !== 'active') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Only status=active is currently supported',
        });
      }

      const grants = await getActiveBtgGrants(req.user!);

      res.status(200).json({
        grants,
        count: grants.length,
      });
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('BTG grants list error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve BTG grants',
      });
    }
  }
);

/**
 * GET /api/admin/btg/config
 *
 * Get BTG configuration (allowed durations, etc.)
 * Helpful for client applications to know valid values
 *
 * Security: JWT + ADMIN role
 *
 * Response 200:
 * {
 *   "allowedDurations": [30, 60, 120, 240, 480],
 *   "justificationMinLength": 25,
 *   "justificationMaxLength": 500
 * }
 */
router.get(
  '/config',
  authenticateToken,
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    res.status(200).json({
      allowedDurations: ALLOWED_DURATIONS,
      justificationMinLength: 25,
      justificationMaxLength: 500,
    });
  }
);

export default router;
