/**
 * Billing Code Routes
 *
 * CRUD endpoints for Billing Code management with RBAC
 * All billing code operations require ADMIN role
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  createBillingCode,
  getBillingCodes,
  getBillingCodeById,
  updateBillingCode,
  deleteBillingCode
} from '../services/billing-code.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';
import { logAuditEvent } from '../services/audit.service';

const router = Router();

// All routes require authentication and organization scoping
router.use(authenticateToken);
router.use(organizationScope);

/**
 * @swagger
 * /billing-codes:
 *   post:
 *     tags:
 *       - Billing Codes
 *     summary: Create a new billing code
 *     description: Creates a new billing code for the organization. Requires ADMIN role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: The billing code (e.g., CPT or HCPCS code)
 *               description:
 *                 type: string
 *                 description: Official description of the billing code
 *               rate:
 *                 type: number
 *                 format: float
 *                 description: Standard rate for this billing code
 *               category:
 *                 type: string
 *                 description: Category (e.g., "CPT", "HCPCS")
 *                 nullable: true
 *               requiresModifier:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this code requires a modifier
 *             required:
 *               - code
 *               - description
 *               - rate
 *           example:
 *             code: "97153"
 *             description: "Adaptive behavior treatment by protocol, administered by technician"
 *             rate: 85.50
 *             category: "CPT"
 *             requiresModifier: false
 *     responses:
 *       '201':
 *         description: Billing code created successfully
 *       '400':
 *         description: Bad Request - Missing required fields or validation error
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Requires ADMIN role
 *       '409':
 *         description: Conflict - Billing code already exists
 */
router.post(
  '/',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { code, description, rate, category, requiresModifier } = req.body;

      // Validate required fields
      if (!code || !description || rate === undefined) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'code, description, and rate are required'
        });
        return;
      }

      // Validate rate is a number
      const parsedRate = parseFloat(rate);
      if (isNaN(parsedRate)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'rate must be a valid number'
        });
        return;
      }

      const billingCode = await createBillingCode(
        {
          code,
          description,
          rate: parsedRate,
          category,
          requiresModifier
        },
        req.user!
      );

      await logAuditEvent({
        userId: req.user!.userId,
        organizationId: req.user!.organizationId,
        action: 'CREATE',
        resource: 'BILLING_CODE',
        resourceId: billingCode.id,
        details: { code: billingCode.code, rate: billingCode.rate }
      });

      res.status(201).json(billingCode);
    } catch (error: any) {
      if (error.message === 'Billing code already exists for this organization') {
        res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
        return;
      }

      res.status(400).json({
        error: 'Bad Request',
        message: error.message || 'Failed to create billing code'
      });
    }
  }
);

/**
 * @swagger
 * /billing-codes:
 *   get:
 *     tags:
 *       - Billing Codes
 *     summary: Get all billing codes
 *     description: Retrieves all billing codes for the organization with pagination and filtering
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by code or description
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       '200':
 *         description: List of billing codes retrieved successfully
 *       '401':
 *         description: Unauthorized
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const search = req.query.search as string;
    const category = req.query.category as string;
    const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

    const result = await getBillingCodes(
      {
        page,
        limit,
        search,
        category,
        isActive
      },
      req.user!
    );

    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Failed to retrieve billing codes'
    });
  }
});

/**
 * @swagger
 * /billing-codes/{id}:
 *   get:
 *     tags:
 *       - Billing Codes
 *     summary: Get a billing code by ID
 *     description: Retrieves a single billing code by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing code ID
 *     responses:
 *       '200':
 *         description: Billing code retrieved successfully
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Not in your organization
 *       '404':
 *         description: Billing code not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const billingCode = await getBillingCodeById(id, req.user!);

    res.json(billingCode);
  } catch (error: any) {
    if (error.message === 'Billing code not found') {
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
      message: error.message || 'Failed to retrieve billing code'
    });
  }
});

/**
 * @swagger
 * /billing-codes/{id}:
 *   put:
 *     tags:
 *       - Billing Codes
 *     summary: Update a billing code
 *     description: Updates an existing billing code. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing code ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *               rate:
 *                 type: number
 *                 format: float
 *               category:
 *                 type: string
 *                 nullable: true
 *               requiresModifier:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *           example:
 *             rate: 90.00
 *             description: "Updated description"
 *     responses:
 *       '200':
 *         description: Billing code updated successfully
 *       '400':
 *         description: Bad Request
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Requires ADMIN role
 *       '404':
 *         description: Billing code not found
 *       '409':
 *         description: Conflict - Code already exists
 */
router.put(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { code, description, rate, category, requiresModifier, isActive } = req.body;

      // Parse rate if provided
      const parsedRate = rate !== undefined ? parseFloat(rate) : undefined;
      if (parsedRate !== undefined && isNaN(parsedRate)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'rate must be a valid number'
        });
        return;
      }

      const billingCode = await updateBillingCode(
        id,
        {
          code,
          description,
          rate: parsedRate,
          category,
          requiresModifier,
          isActive
        },
        req.user!
      );

      await logAuditEvent({
        userId: req.user!.userId,
        organizationId: req.user!.organizationId,
        action: 'UPDATE',
        resource: 'BILLING_CODE',
        resourceId: billingCode.id,
        details: { code: billingCode.code }
      });

      res.json(billingCode);
    } catch (error: any) {
      if (error.message === 'Billing code not found') {
        res.status(404).json({
          error: 'Not Found',
          message: error.message
        });
        return;
      }

      if (error.message === 'Billing code already exists for this organization') {
        res.status(409).json({
          error: 'Conflict',
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
        message: error.message || 'Failed to update billing code'
      });
    }
  }
);

/**
 * @swagger
 * /billing-codes/{id}:
 *   delete:
 *     tags:
 *       - Billing Codes
 *     summary: Delete a billing code
 *     description: Soft deletes a billing code by setting isActive to false. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Billing code ID
 *     responses:
 *       '200':
 *         description: Billing code deleted successfully
 *       '400':
 *         description: Bad Request - Code is in use
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Requires ADMIN role
 *       '404':
 *         description: Billing code not found
 */
router.delete(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const billingCode = await deleteBillingCode(id, req.user!);

      await logAuditEvent({
        userId: req.user!.userId,
        organizationId: req.user!.organizationId,
        action: 'DELETE',
        resource: 'BILLING_CODE',
        resourceId: billingCode.id,
        details: { code: billingCode.code }
      });

      res.json({
        message: 'Billing code deleted successfully',
        billingCode
      });
    } catch (error: any) {
      if (error.message === 'Billing code not found') {
        res.status(404).json({
          error: 'Not Found',
          message: error.message
        });
        return;
      }

      if (error.message.includes('Cannot delete billing code')) {
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
        message: error.message || 'Failed to delete billing code'
      });
    }
  }
);

export default router;
