/**
 * Insurance Routes
 *
 * CRUD endpoints for Patient Insurance management with RBAC and audit logging
 * All insurance access is logged for HIPAA compliance
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  createInsurance,
  getAllInsurance,
  getInsuranceById,
  getInsuranceByPatientId,
  updateInsurance,
  deleteInsurance,
  verifyEligibility
} from '../services/insurance.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';
import { logAuditEvent } from '../services/audit.service';

const router = Router();

// All routes require authentication and organization scoping
router.use(authenticateToken);
router.use(organizationScope);

/**
 * @swagger
 * /insurance:
 *   post:
 *     tags:
 *       - Insurance
 *     summary: Create a new insurance record
 *     description: Creates a new insurance record for a patient. Requires ADMIN role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the patient this insurance belongs to.
 *               payerName:
 *                 type: string
 *                 description: Name of the insurance payer.
 *               payerId:
 *                 type: string
 *                 description: National Payer ID.
 *                 nullable: true
 *               memberNumber:
 *                 type: string
 *                 description: The patient's insurance member or policy number.
 *               groupNumber:
 *                 type: string
 *                 description: The insurance group number.
 *                 nullable: true
 *               effectiveDate:
 *                 type: string
 *                 format: date
 *                 description: The date when the insurance coverage becomes effective.
 *               terminationDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 description: The date when the insurance coverage terminates.
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the insurance is currently active.
 *             required:
 *               - patientId
 *               - payerName
 *               - memberNumber
 *               - effectiveDate
 *           example:
 *             patientId: "d290f1ee-6c54-4b01-90e6-d701748f0851"
 *             payerName: "Blue Cross Blue Shield"
 *             memberNumber: "X123456789"
 *             effectiveDate: "2023-01-01"
 *     responses:
 *       '201':
 *         description: Insurance record created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Insurance'
 *       '400':
 *         description: Bad Request - Missing required fields or invalid data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         description: Not Found - Patient with the given patientId does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
router.post(
  '/',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { patientId, payerName, payerId, memberNumber, groupNumber, effectiveDate, terminationDate, isActive } = req.body;

      // Validate required fields
      if (!patientId || !payerName || !memberNumber || !effectiveDate) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'patientId, payerName, memberNumber, and effectiveDate are required'
        });
        return;
      }

      // Create insurance
      const insurance = await createInsurance(
        {
          patientId,
          payerName,
          payerId,
          memberNumber,
          groupNumber,
          effectiveDate: new Date(effectiveDate),
          terminationDate: terminationDate ? new Date(terminationDate) : undefined,
          isActive
        },
        req.user!
      );

      // Audit log with organization context
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'CREATE_INSURANCE',
        resource: 'insurance',
        resourceId: insurance.id,
        organizationId: insurance.organizationId,
        details: {
          patientId: insurance.patientId,
          payerName: insurance.payerName,
          memberNumber: insurance.memberNumber
        }
      });

      res.status(201).json(insurance);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: error.message });
      } else {
        res.status(400).json({ error: 'Bad Request', message: error.message });
      }
    }
  }
);

/**
 * @swagger
 * /insurance:
 *   get:
 *     tags:
 *       - Insurance
 *     summary: Get all insurance records
 *     description: Retrieves a paginated list of insurance records. Can be filtered by search query, patient, and active status. Requires ADMIN or PRACTITIONER role.
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter by payer name or member number.
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter insurance records by patient ID.
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter insurance records by active status.
 *     responses:
 *       '200':
 *         description: A paginated list of insurance records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 insurance:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Insurance'
 *                 total:
 *                   type: integer
 *                   example: 1
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *       '400':
 *         description: Bad Request - Invalid query parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { page, limit, search, patientId, isActive } = req.query;

      const filters: any = {};
      if (page) filters.page = parseInt(page as string);
      if (limit) filters.limit = parseInt(limit as string);
      if (search) filters.search = search as string;
      if (patientId) filters.patientId = patientId as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';

      const result = await getAllInsurance(req.user!, filters);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'READ_INSURANCE',
        resource: 'insurance',
        organizationId: req.user!.organizationId!,
        details: {
          filters,
          resultCount: result.insurance.length
        }
      });

      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else {
        res.status(400).json({ error: 'Bad Request', message: error.message });
      }
    }
  }
);

/**
 * @swagger
 * /insurance/{id}:
 *   get:
 *     tags:
 *       - Insurance
 *     summary: Get insurance by ID
 *     description: Retrieves a single insurance record by its unique ID. Accessible to any authenticated user within the same organization as the insurance record.
 *     parameters:
 *       - $ref: '#/components/parameters/InsuranceId'
 *     responses:
 *       '200':
 *         description: Successfully retrieved insurance record.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Insurance'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const insurance = await getInsuranceById(req.params.id, req.user!);

    if (!insurance) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Insurance not found'
      });
      return;
    }

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'READ_INSURANCE',
      resource: 'insurance',
      resourceId: insurance.id,
      organizationId: insurance.organizationId,
      details: {
        patientId: insurance.patientId,
        payerName: insurance.payerName
      }
    });

    res.json(insurance);
  } catch (error: any) {
    if (error.message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message: error.message });
    } else if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }
});

/**
 * @swagger
 * /insurance/patients/{patientId}/insurance:
 *   get:
 *     tags:
 *       - Insurance
 *     summary: Get all insurance records for a specific patient
 *     description: Retrieves a list of all insurance records associated with a specific patient ID. Accessible to any authenticated user within the same organization as the patient.
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     responses:
 *       '200':
 *         description: A list of insurance records for the patient.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Insurance'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         description: Not Found - Patient with the given ID does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/patients/:patientId/insurance', async (req: Request, res: Response) => {
  try {
    const insurance = await getInsuranceByPatientId(req.params.patientId, req.user!);

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'READ_INSURANCE',
      resource: 'insurance',
      organizationId: req.user!.organizationId!,
      details: {
        patientId: req.params.patientId,
        resultCount: insurance.length
      }
    });

    res.json(insurance);
  } catch (error: any) {
    if (error.message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message: error.message });
    } else if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }
});

/**
 * @swagger
 * /insurance/{id}:
 *   put:
 *     tags:
 *       - Insurance
 *     summary: Update an insurance record
 *     description: Updates an existing insurance record. Only fields provided in the request body will be updated. Requires ADMIN role.
 *     parameters:
 *       - $ref: '#/components/parameters/InsuranceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payerName:
 *                 type: string
 *               payerId:
 *                 type: string
 *               memberNumber:
 *                 type: string
 *               groupNumber:
 *                 type: string
 *               effectiveDate:
 *                 type: string
 *                 format: date
 *               terminationDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               isActive:
 *                 type: boolean
 *           example:
 *             payerName: "BCBS of Texas"
 *             isActive: false
 *     responses:
 *       '200':
 *         description: Insurance record updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Insurance'
 *       '400':
 *         description: Bad Request - Invalid data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { payerName, payerId, memberNumber, groupNumber, effectiveDate, terminationDate, isActive } = req.body;

      const updateData: any = {};
      if (payerName !== undefined) updateData.payerName = payerName;
      if (payerId !== undefined) updateData.payerId = payerId;
      if (memberNumber !== undefined) updateData.memberNumber = memberNumber;
      if (groupNumber !== undefined) updateData.groupNumber = groupNumber;
      if (effectiveDate !== undefined) updateData.effectiveDate = new Date(effectiveDate);
      if (terminationDate !== undefined) updateData.terminationDate = new Date(terminationDate);
      if (isActive !== undefined) updateData.isActive = isActive;

      const insurance = await updateInsurance(req.params.id, updateData, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'UPDATE_INSURANCE',
        resource: 'insurance',
        resourceId: insurance.id,
        organizationId: insurance.organizationId,
        details: {
          patientId: insurance.patientId,
          updatedFields: Object.keys(updateData)
        }
      });

      res.json(insurance);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: error.message });
      } else {
        res.status(400).json({ error: 'Bad Request', message: error.message });
      }
    }
  }
);

/**
 * @swagger
 * /insurance/{id}:
 *   delete:
 *     tags:
 *       - Insurance
 *     summary: Delete an insurance record
 *     description: Deletes an insurance record by its ID. Requires ADMIN role.
 *     parameters:
 *       - $ref: '#/components/parameters/InsuranceId'
 *     responses:
 *       '204':
 *         description: Insurance record deleted successfully.
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      await deleteInsurance(req.params.id, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'DELETE_INSURANCE',
        resource: 'insurance',
        resourceId: req.params.id,
        organizationId: req.user!.organizationId!,
        details: {
          insuranceId: req.params.id
        }
      });

      res.status(204).send();
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
      }
    }
  }
);

/**
 * @swagger
 * /insurance/{id}/verify:
 *   post:
 *     tags:
 *       - Insurance
 *     summary: Verify insurance eligibility
 *     description: Records an eligibility verification for an insurance record. This updates the `lastVerifiedAt` timestamp and stores verification details. Requires ADMIN role.
 *     parameters:
 *       - $ref: '#/components/parameters/InsuranceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verifiedBy:
 *                 type: string
 *                 description: Name or ID of the person who performed the verification.
 *               coverageActive:
 *                 type: boolean
 *                 description: Whether the coverage was confirmed as active.
 *               planName:
 *                 type: string
 *                 nullable: true
 *                 description: Name of the insurance plan.
 *               copayAmount:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Copay amount for services.
 *               notes:
 *                 type: string
 *                 nullable: true
 *                 description: Any notes from the verification call.
 *             required:
 *               - verifiedBy
 *               - coverageActive
 *           example:
 *             verifiedBy: "Jane Doe"
 *             coverageActive: true
 *             planName: "PPO Gold Plan"
 *             copayAmount: 25.50
 *             notes: "Verified by phone on 2025-11-27. Spoke to agent Mike."
 *     responses:
 *       '200':
 *         description: Eligibility verified and insurance record updated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Insurance'
 *       '400':
 *         description: Bad Request - Missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post(
  '/:id/verify',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { verifiedBy, coverageActive, planName, copayAmount, notes } = req.body;

      // Validate required fields
      if (!verifiedBy || coverageActive === undefined) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'verifiedBy and coverageActive are required'
        });
        return;
      }

      const verification = {
        verifiedBy,
        verifiedAt: new Date(),
        coverageActive,
        planName,
        copayAmount,
        notes
      };

      const insurance = await verifyEligibility(req.params.id, verification, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'VERIFY_ELIGIBILITY',
        resource: 'insurance',
        resourceId: insurance.id,
        organizationId: insurance.organizationId,
        details: {
          patientId: insurance.patientId,
          coverageActive,
          verifiedBy
        }
      });

      res.json(insurance);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: error.message });
      } else {
        res.status(400).json({ error: 'Bad Request', message: error.message });
      }
    }
  }
);

export default router;
