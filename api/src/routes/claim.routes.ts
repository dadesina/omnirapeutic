/**
 * Claim Routes
 *
 * CRUD endpoints for Claim management with RBAC
 * Handles claim generation from sessions and claim lifecycle management
 */

import { Router, Request, Response } from 'express';
import { Role, ClaimStatus } from '@prisma/client';
import {
  createClaimFromSessions,
  getClaims,
  getClaimById,
  updateClaimStatus
} from '../services/claim.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';
import { logAuditEvent } from '../services/audit.service';

const router = Router();

// All routes require authentication and organization scoping
router.use(authenticateToken);
router.use(organizationScope);

/**
 * @swagger
 * /claims:
 *   post:
 *     tags:
 *       - Claims
 *     summary: Create a claim from completed sessions
 *     description: Generates a new claim with line items from completed therapy sessions. Requires ADMIN role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of completed session IDs to include in the claim
 *                 minItems: 1
 *             required:
 *               - sessionIds
 *           example:
 *             sessionIds: ["d290f1ee-6c54-4b01-90e6-d701748f0851", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
 *     responses:
 *       '201':
 *         description: Claim created successfully with DRAFT status
 *       '400':
 *         description: Bad Request - Validation error (incomplete sessions, already billed, etc.)
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Requires ADMIN role
 *       '422':
 *         description: Unprocessable Entity - Business logic validation failed
 */
router.post(
  '/',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { sessionIds } = req.body;

      // Validate required fields
      if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'sessionIds array is required and must contain at least one session ID'
        });
        return;
      }

      const claim = await createClaimFromSessions(
        { sessionIds },
        req.user!
      );

      await logAuditEvent({
        userId: req.user!.userId,
        organizationId: req.user!.organizationId,
        action: 'CREATE',
        resource: 'CLAIM',
        resourceId: claim.id,
        details: {
          claimNumber: claim.claimNumber,
          patientId: claim.patientId,
          sessionCount: sessionIds.length,
          totalAmount: claim.totalBilledAmount.toString()
        }
      });

      res.status(201).json(claim);
    } catch (error: any) {
      // Business logic validation errors (422)
      if (
        error.message.includes('must belong to') ||
        error.message.includes('must have') ||
        error.message.includes('already been billed') ||
        error.message.includes('no active insurance') ||
        error.message.includes('no billable service')
      ) {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: error.message
        });
        return;
      }

      // Forbidden errors
      if (error.message.includes('Forbidden')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message
        });
        return;
      }

      res.status(400).json({
        error: 'Bad Request',
        message: error.message || 'Failed to create claim'
      });
    }
  }
);

/**
 * @swagger
 * /claims:
 *   get:
 *     tags:
 *       - Claims
 *     summary: Get all claims
 *     description: Retrieves all claims for the organization with pagination and filtering
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, READY_TO_SUBMIT, SUBMITTED, PAID, REJECTED, DENIED]
 *         description: Filter by claim status
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by patient ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date of service start (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date of service end (inclusive)
 *     responses:
 *       '200':
 *         description: List of claims retrieved successfully
 *       '401':
 *         description: Unauthorized
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const status = req.query.status as ClaimStatus | undefined;
    const patientId = req.query.patientId as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const result = await getClaims(
      {
        page,
        limit,
        status,
        patientId,
        startDate,
        endDate
      },
      req.user!
    );

    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Failed to retrieve claims'
    });
  }
});

/**
 * @swagger
 * /claims/{id}:
 *   get:
 *     tags:
 *       - Claims
 *     summary: Get a claim by ID
 *     description: Retrieves a single claim with all line items and related data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Claim ID
 *     responses:
 *       '200':
 *         description: Claim retrieved successfully
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Not in your organization
 *       '404':
 *         description: Claim not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const claim = await getClaimById(id, req.user!);

    res.json(claim);
  } catch (error: any) {
    if (error.message === 'Claim not found') {
      res.status(404).json({
        error: 'Not Found',
        message: error.message
      });
      return;
    }

    if (error.message.includes('Forbidden')) {
      res.status(403).json({
        error: 'Forbidden',
        message: error.message
      });
      return;
    }

    res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Failed to retrieve claim'
    });
  }
});

/**
 * @swagger
 * /claims/{id}/status:
 *   patch:
 *     tags:
 *       - Claims
 *     summary: Update claim status
 *     description: Updates the status of a claim. Requires ADMIN role. Validates status transitions.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Claim ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [DRAFT, READY_TO_SUBMIT, SUBMITTED, PAID, REJECTED, DENIED]
 *                 description: New claim status
 *             required:
 *               - status
 *           example:
 *             status: "READY_TO_SUBMIT"
 *     responses:
 *       '200':
 *         description: Claim status updated successfully
 *       '400':
 *         description: Bad Request - Invalid status transition
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Requires ADMIN role
 *       '404':
 *         description: Claim not found
 */
router.patch(
  '/:id/status',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (!status || !Object.values(ClaimStatus).includes(status)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Valid status is required'
        });
        return;
      }

      const claim = await updateClaimStatus(id, status, req.user!);

      await logAuditEvent({
        userId: req.user!.userId,
        organizationId: req.user!.organizationId,
        action: 'UPDATE',
        resource: 'CLAIM',
        resourceId: claim.id,
        details: {
          claimNumber: claim.claimNumber,
          oldStatus: req.body.oldStatus,
          newStatus: status
        }
      });

      res.json(claim);
    } catch (error: any) {
      if (error.message === 'Claim not found') {
        res.status(404).json({
          error: 'Not Found',
          message: error.message
        });
        return;
      }

      if (error.message.includes('Invalid status transition')) {
        res.status(400).json({
          error: 'Bad Request',
          message: error.message
        });
        return;
      }

      if (error.message.includes('Forbidden')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message
        });
        return;
      }

      res.status(400).json({
        error: 'Bad Request',
        message: error.message || 'Failed to update claim status'
      });
    }
  }
);

export default router;
