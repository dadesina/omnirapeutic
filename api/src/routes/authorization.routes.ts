/**
 * Authorization Routes
 *
 * CRUD endpoints for Authorization management with RBAC and audit logging
 * THE MOST CRITICAL API - prevents overbilling through unit tracking
 */

import { Router, Request, Response } from 'express';
import { Role, AuthStatus } from '@prisma/client';
import {
  createAuthorization,
  getAllAuthorizations,
  getAuthorizationById,
  getAuthorizationsByPatientId,
  updateAuthorization,
  deleteAuthorization,
  checkAvailableUnits,
  reserveUnits,
  releaseUnits,
  consumeUnits,
  getActiveAuthorization
} from '../services/authorization.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';
import { logAuditEvent } from '../services/audit.service';

const router = Router();

// All routes require authentication and organization scoping
router.use(authenticateToken);
router.use(organizationScope);

/**
 * @swagger
 * /authorizations:
 *   post:
 *     tags:
 *       - Authorizations
 *     summary: Create a new authorization
 *     description: Creates a new authorization for a patient, linking them to a specific service and number of billable units. Requires ADMIN role.
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
 *                 description: The patient this authorization is for.
 *               insuranceId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: The associated insurance record.
 *               serviceCodeId:
 *                 type: string
 *                 format: uuid
 *                 description: The service code covered by this authorization.
 *               authNumber:
 *                 type: string
 *                 nullable: true
 *                 description: The payer's authorization number.
 *               totalUnits:
 *                 type: integer
 *                 description: Total authorized units.
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Authorization start date.
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Authorization end date.
 *               status:
 *                 type: string
 *                 enum: [PENDING, ACTIVE, EXHAUSTED, EXPIRED, CANCELLED]
 *                 description: The status of the authorization. Defaults to PENDING or ACTIVE based on start date.
 *               notes:
 *                 type: string
 *                 nullable: true
 *             required:
 *               - patientId
 *               - serviceCodeId
 *               - totalUnits
 *               - startDate
 *               - endDate
 *           example:
 *             patientId: "d290f1ee-6c54-4b01-90e6-d701748f0851"
 *             serviceCodeId: "c2a0f1ee-6c54-4b01-90e6-d701748f0852"
 *             authNumber: "AUTH-12345"
 *             totalUnits: 100
 *             startDate: "2024-01-01"
 *             endDate: "2024-12-31"
 *             status: "ACTIVE"
 *     responses:
 *       '201':
 *         description: Authorization created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         description: Not Found - The specified patientId or serviceCodeId does not exist.
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
      const { patientId, insuranceId, serviceCodeId, authNumber, totalUnits, startDate, endDate, status, notes } = req.body;

      // Validate required fields
      if (!patientId || !serviceCodeId || !totalUnits || !startDate || !endDate) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'patientId, serviceCodeId, totalUnits, startDate, and endDate are required'
        });
        return;
      }

      // Create authorization
      const authorization = await createAuthorization(
        {
          patientId,
          insuranceId,
          serviceCodeId,
          authNumber,
          totalUnits,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: status as AuthStatus,
          notes
        },
        req.user!
      );

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'CREATE_AUTHORIZATION',
        resource: 'authorization',
        resourceId: authorization.id,
        organizationId: authorization.organizationId,
        details: {
          patientId: authorization.patientId,
          serviceCodeId: authorization.serviceCodeId,
          totalUnits: authorization.totalUnits
        }
      });

      res.status(201).json(authorization);
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
 * /authorizations:
 *   get:
 *     tags:
 *       - Authorizations
 *     summary: Get all authorizations
 *     description: Retrieves a paginated list of authorizations. Can be filtered by patient, status, and a search term. Requires ADMIN or PRACTITIONER role.
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter by authorization number.
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter authorizations by patient ID.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, EXHAUSTED, EXPIRED, CANCELLED]
 *         description: Filter authorizations by status.
 *     responses:
 *       '200':
 *         description: A paginated list of authorizations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authorizations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Authorization'
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
 *         $ref: '#/components/responses/ValidationError'
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
      const { page, limit, search, patientId, status } = req.query;

      const filters: any = {};
      if (page) filters.page = parseInt(page as string);
      if (limit) filters.limit = parseInt(limit as string);
      if (search) filters.search = search as string;
      if (patientId) filters.patientId = patientId as string;
      if (status) filters.status = status as AuthStatus;

      const result = await getAllAuthorizations(req.user!, filters);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'READ_AUTHORIZATION',
        resource: 'authorization',
        organizationId: req.user!.organizationId!,
        details: {
          filters,
          resultCount: result.authorizations.length
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
 * /authorizations/{id}:
 *   get:
 *     tags:
 *       - Authorizations
 *     summary: Get authorization by ID
 *     description: Retrieves a single authorization record by its unique ID. Accessible to any authenticated user within the same organization.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     responses:
 *       '200':
 *         description: Successfully retrieved the authorization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const authorization = await getAuthorizationById(req.params.id, req.user!);

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'READ_AUTHORIZATION',
      resource: 'authorization',
      resourceId: authorization.id,
      organizationId: authorization.organizationId,
      details: {
        patientId: authorization.patientId,
        totalUnits: authorization.totalUnits,
        usedUnits: authorization.usedUnits,
        scheduledUnits: authorization.scheduledUnits
      }
    });

    res.json(authorization);
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
 * /authorizations/patients/{patientId}/authorizations:
 *   get:
 *     tags:
 *       - Authorizations
 *     summary: Get all authorizations for a specific patient
 *     description: Retrieves a list of all authorization records for a specific patient ID. Accessible to any authenticated user within the same organization.
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     responses:
 *       '200':
 *         description: A list of authorizations for the patient.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Authorization'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 */
router.get('/patients/:patientId/authorizations', async (req: Request, res: Response) => {
  try {
    const authorizations = await getAuthorizationsByPatientId(req.params.patientId, req.user!);

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'READ_AUTHORIZATION',
      resource: 'authorization',
      organizationId: req.user!.organizationId!,
      details: {
        patientId: req.params.patientId,
        resultCount: authorizations.length
      }
    });

    res.json(authorizations);
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
 * /authorizations/{id}:
 *   put:
 *     tags:
 *       - Authorizations
 *     summary: Update an authorization
 *     description: Updates an existing authorization. Only fields provided in the request body will be updated. Requires ADMIN role.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               insuranceId:
 *                 type: string
 *                 format: uuid
 *               serviceCodeId:
 *                 type: string
 *                 format: uuid
 *               authNumber:
 *                 type: string
 *               totalUnits:
 *                 type: integer
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [PENDING, ACTIVE, EXHAUSTED, EXPIRED, CANCELLED]
 *               notes:
 *                 type: string
 *           example:
 *             totalUnits: 120
 *             status: "ACTIVE"
 *     responses:
 *       '200':
 *         description: Authorization updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
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
      const { insuranceId, serviceCodeId, authNumber, totalUnits, startDate, endDate, status, notes } = req.body;

      const updateData: any = {};
      if (insuranceId !== undefined) updateData.insuranceId = insuranceId;
      if (serviceCodeId !== undefined) updateData.serviceCodeId = serviceCodeId;
      if (authNumber !== undefined) updateData.authNumber = authNumber;
      if (totalUnits !== undefined) updateData.totalUnits = totalUnits;
      if (startDate !== undefined) updateData.startDate = new Date(startDate);
      if (endDate !== undefined) updateData.endDate = new Date(endDate);
      if (status !== undefined) updateData.status = status as AuthStatus;
      if (notes !== undefined) updateData.notes = notes;

      const authorization = await updateAuthorization(req.params.id, updateData, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'UPDATE_AUTHORIZATION',
        resource: 'authorization',
        resourceId: authorization.id,
        organizationId: authorization.organizationId,
        details: {
          patientId: authorization.patientId,
          updatedFields: Object.keys(updateData)
        }
      });

      res.json(authorization);
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
 * /authorizations/{id}:
 *   delete:
 *     tags:
 *       - Authorizations
 *     summary: Delete an authorization
 *     description: Deletes an authorization by its ID. Requires ADMIN role.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     responses:
 *       '204':
 *         description: Authorization deleted successfully.
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 */
router.delete(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      await deleteAuthorization(req.params.id, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'DELETE_AUTHORIZATION',
        resource: 'authorization',
        resourceId: req.params.id,
        organizationId: req.user!.organizationId!,
        details: {
          authorizationId: req.params.id
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
 * /authorizations/{id}/available-units:
 *   get:
 *     tags:
 *       - Authorizations
 *     summary: Check available units for an authorization
 *     description: Calculates the number of units that are available for scheduling (total - used - scheduled). Accessible to any authenticated user within the same organization.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     responses:
 *       '200':
 *         description: Available units calculated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUnits:
 *                   type: integer
 *                 usedUnits:
 *                   type: integer
 *                 scheduledUnits:
 *                   type: integer
 *                 availableUnits:
 *                   type: integer
 *               example:
 *                 totalUnits: 100
 *                 usedUnits: 20
 *                 scheduledUnits: 10
 *                 availableUnits: 70
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         $ref: '#/components/responses/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 */
router.get('/:id/available-units', async (req: Request, res: Response) => {
  try {
    const units = await checkAvailableUnits(req.params.id, req.user!);

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'CHECK_UNITS',
      resource: 'authorization',
      resourceId: req.params.id,
      organizationId: req.user!.organizationId!,
      details: {
        availableUnits: units.availableUnits,
        totalUnits: units.totalUnits
      }
    });

    res.json(units);
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
 * /authorizations/{id}/reserve:
 *   post:
 *     tags:
 *       - Authorizations
 *     summary: Reserve units for a scheduled appointment
 *     description: >-
 *       **Critical finance operation.** Temporarily allocates units from an authorization when an appointment is scheduled.
 *       This prevents over-scheduling and ensures units are available for future billing.
 *
 *       These units are held in `scheduledUnits` and are moved to `usedUnits` via the `consume` endpoint upon session completion.
 *       All unit operations are executed within a `SERIALIZABLE` transaction to guarantee atomicity and prevent race conditions.
 *       Requires ADMIN or PRACTITIONER role.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               units:
 *                 type: integer
 *                 description: The number of units to reserve.
 *             required:
 *               - units
 *           example:
 *             units: 4
 *     responses:
 *       '200':
 *         description: Units reserved successfully. Returns the updated authorization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '400':
 *         description: Bad Request - Insufficient units available or invalid input.
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
  '/:id/reserve',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { units } = req.body;

      if (!units || units <= 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'units must be a positive number'
        });
        return;
      }

      const authorization = await reserveUnits(req.params.id, units, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'RESERVE_UNITS',
        resource: 'authorization',
        resourceId: authorization.id,
        organizationId: authorization.organizationId,
        details: {
          unitsReserved: units,
          newScheduledUnits: authorization.scheduledUnits
        }
      });

      res.json(authorization);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else if (error.message.includes('Insufficient units')) {
        res.status(400).json({ error: 'Insufficient Units', message: error.message });
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
 * /authorizations/{id}/release:
 *   post:
 *     tags:
 *       - Authorizations
 *     summary: Release reserved units
 *     description: >-
 *       **Critical finance operation.** Returns previously reserved units back to the available pool, typically when a scheduled appointment is cancelled.
 *       This operation decrements `scheduledUnits`.
 *
 *       All unit operations are executed within a `SERIALIZABLE` transaction to guarantee atomicity.
 *       Requires ADMIN or PRACTITIONER role.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               units:
 *                 type: integer
 *                 description: The number of units to release.
 *             required:
 *               - units
 *           example:
 *             units: 4
 *     responses:
 *       '200':
 *         description: Units released successfully. Returns the updated authorization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '400':
 *         description: Bad Request - Cannot release more units than are scheduled.
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
  '/:id/release',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { units } = req.body;

      if (!units || units <= 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'units must be a positive number'
        });
        return;
      }

      const authorization = await releaseUnits(req.params.id, units, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'RELEASE_UNITS',
        resource: 'authorization',
        resourceId: authorization.id,
        organizationId: authorization.organizationId,
        details: {
          unitsReleased: units,
          newScheduledUnits: authorization.scheduledUnits
        }
      });

      res.json(authorization);
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
 * /authorizations/{id}/consume:
 *   post:
 *     tags:
 *       - Authorizations
 *     summary: Consume units after a completed session
 *     description: >-
 *       **The most critical billing operation.** Permanently deducts units from an authorization after a therapy session has been completed and verified.
 *       This atomically moves units from `scheduledUnits` to `usedUnits`, marking them as ready for billing.
 *
 *       This prevents over-billing and ensures every rendered service is backed by a valid, available unit. This is the final step in the unit lifecycle (`reserve` -> `consume`).
 *       All unit operations are executed within a `SERIALIZABLE` transaction to guarantee atomicity.
 *       Requires ADMIN or PRACTITIONER role.
 *     parameters:
 *       - $ref: '#/components/parameters/AuthorizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               units:
 *                 type: integer
 *                 description: The number of units to consume.
 *             required:
 *               - units
 *           example:
 *             units: 4
 *     responses:
 *       '200':
 *         description: Units consumed successfully. Returns the updated authorization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '400':
 *         description: Bad Request - Cannot consume more units than are scheduled.
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
  '/:id/consume',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { units } = req.body;

      if (!units || units <= 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'units must be a positive number'
        });
        return;
      }

      const authorization = await consumeUnits(req.params.id, units, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'CONSUME_UNITS',
        resource: 'authorization',
        resourceId: authorization.id,
        organizationId: authorization.organizationId,
        details: {
          unitsConsumed: units,
          newUsedUnits: authorization.usedUnits,
          newScheduledUnits: authorization.scheduledUnits,
          newStatus: authorization.status
        }
      });

      res.json(authorization);
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
 * /authorizations/active/{patientId}/{serviceCodeId}:
 *   get:
 *     tags:
 *       - Authorizations
 *     summary: Get active authorization for a patient and service
 *     description: Finds the single currently active and valid authorization for a given patient and service code. This is a helper endpoint for schedulers to quickly find the correct authorization for a new appointment.
 *     parameters:
 *       - in: path
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the patient.
 *       - in: path
 *         name: serviceCodeId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the service code.
 *     responses:
 *       '200':
 *         description: The active authorization for the patient and service.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Authorization'
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '403':
 *         $ref: '#/components/responses/ForbiddenError'
 *       '404':
 *         description: No active authorization found for this patient and service code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       '500':
 *         description: Internal Server Error
 */
router.get('/active/:patientId/:serviceCodeId', async (req: Request, res: Response) => {
  try {
    const authorization = await getActiveAuthorization(
      req.params.patientId,
      req.params.serviceCodeId,
      req.user!
    );

    if (!authorization) {
      res.status(404).json({
        error: 'Not Found',
        message: 'No active authorization found for this patient and service code'
      });
      return;
    }

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'GET_ACTIVE_AUTHORIZATION',
      resource: 'authorization',
      resourceId: authorization.id,
      organizationId: authorization.organizationId,
      details: {
        patientId: req.params.patientId,
        serviceCodeId: req.params.serviceCodeId
      }
    });

    res.json(authorization);
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

export default router;
