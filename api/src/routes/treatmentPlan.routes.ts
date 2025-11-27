/**
 * Treatment Plan Routes
 *
 * CRUD endpoints for Treatment Plan management with RBAC and audit logging
 * HIPAA Compliance: All access is logged for compliance
 */

import { Router, Request, Response } from 'express';
import { Role, TreatmentPlanStatus } from '@prisma/client';
import {
  createTreatmentPlan,
  getTreatmentPlanById,
  getAllTreatmentPlans,
  updateTreatmentPlan,
  updateTreatmentPlanStatus,
  getTreatmentPlansByPatient,
} from '../services/treatmentPlan.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';

const router = Router();

// All routes require authentication and organization scoping
router.use(authenticateToken);
router.use(organizationScope);

/**
 * POST /api/treatment-plans
 * Create a new treatment plan (Admin and Practitioner only)
 */
router.post(
  '/treatment-plans',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const {
        patientId,
        authorizationId,
        title,
        description,
        startDate,
        endDate,
        reviewDate,
      } = req.body;

      // Validate required fields
      if (!patientId || !title || !description || !startDate || !reviewDate) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'patientId, title, description, startDate, and reviewDate are required',
        });
        return;
      }

      // Validate title length
      if (title.trim().length < 3 || title.trim().length > 200) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Title must be between 3 and 200 characters',
        });
        return;
      }

      // Validate dates
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'startDate must be a valid ISO 8601 date',
        });
        return;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'endDate must be a valid ISO 8601 date',
          });
          return;
        }
        if (end <= start) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'endDate must be after startDate',
          });
          return;
        }
      }

      const review = new Date(reviewDate);
      if (isNaN(review.getTime())) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'reviewDate must be a valid ISO 8601 date',
        });
        return;
      }

      // Create treatment plan
      const treatmentPlan = await createTreatmentPlan(
        {
          patientId,
          authorizationId: authorizationId || undefined,
          title: title.trim(),
          description,
          startDate: start,
          endDate: endDate ? new Date(endDate) : undefined,
          reviewDate: review,
        },
        req.user!
      );

      res.status(201).json(treatmentPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create treatment plan';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      console.error('Create treatment plan error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create treatment plan',
      });
    }
  }
);

/**
 * GET /api/treatment-plans/:id
 * Get treatment plan by ID (Admin, Practitioner, or Patient owner)
 */
router.get('/treatment-plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const treatmentPlan = await getTreatmentPlanById(id, req.user!);

    res.status(200).json(treatmentPlan);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get treatment plan';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get treatment plan error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get treatment plan',
    });
  }
});

/**
 * GET /api/treatment-plans
 * Get all treatment plans with pagination and filters (Admin and Practitioner)
 */
router.get(
  '/treatment-plans',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as TreatmentPlanStatus | undefined;
      const patientId = req.query.patientId as string | undefined;

      // Validate pagination
      if (page < 1) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'page must be greater than 0',
        });
        return;
      }

      if (limit < 1 || limit > 100) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'limit must be between 1 and 100',
        });
        return;
      }

      // Validate status if provided
      if (status && !Object.values(TreatmentPlanStatus).includes(status)) {
        res.status(400).json({
          error: 'Bad Request',
          message: `status must be one of: ${Object.values(TreatmentPlanStatus).join(', ')}`,
        });
        return;
      }

      const result = await getAllTreatmentPlans(req.user!, {
        page,
        limit,
        status,
        patientId,
      });

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get treatment plans';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      console.error('Get treatment plans error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get treatment plans',
      });
    }
  }
);

/**
 * PATCH /api/treatment-plans/:id
 * Update treatment plan (Admin and Practitioner only)
 */
router.patch(
  '/treatment-plans/:id',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, description, startDate, endDate, reviewDate } = req.body;

      // Validate at least one field provided
      if (!title && !description && !startDate && !endDate && !reviewDate) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'At least one field must be provided for update',
        });
        return;
      }

      // Validate title if provided
      if (title && (title.trim().length < 3 || title.trim().length > 200)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Title must be between 3 and 200 characters',
        });
        return;
      }

      // Validate dates if provided
      const updates: any = {};
      if (title) updates.title = title.trim();
      if (description) updates.description = description;

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'startDate must be a valid ISO 8601 date',
          });
          return;
        }
        updates.startDate = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'endDate must be a valid ISO 8601 date',
          });
          return;
        }
        updates.endDate = end;
      }

      if (reviewDate) {
        const review = new Date(reviewDate);
        if (isNaN(review.getTime())) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'reviewDate must be a valid ISO 8601 date',
          });
          return;
        }
        updates.reviewDate = review;
      }

      const treatmentPlan = await updateTreatmentPlan(id, updates, req.user!);

      res.status(200).json(treatmentPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update treatment plan';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      if (message.includes('Invalid transition') || message.includes('Cannot update')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Update treatment plan error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update treatment plan',
      });
    }
  }
);

/**
 * PATCH /api/treatment-plans/:id/status
 * Update treatment plan status (Admin and Practitioner only)
 */
router.patch(
  '/treatment-plans/:id/status',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { newStatus } = req.body;

      // Validate newStatus
      if (!newStatus) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'newStatus is required',
        });
        return;
      }

      if (!Object.values(TreatmentPlanStatus).includes(newStatus)) {
        res.status(400).json({
          error: 'Bad Request',
          message: `newStatus must be one of: ${Object.values(TreatmentPlanStatus).join(', ')}`,
        });
        return;
      }

      const treatmentPlan = await updateTreatmentPlanStatus(id, newStatus, req.user!);

      res.status(200).json(treatmentPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update treatment plan status';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      if (message.includes('Invalid transition')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Update treatment plan status error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update treatment plan status',
      });
    }
  }
);

/**
 * GET /api/patients/:patientId/treatment-plans
 * Get all treatment plans for a patient (Admin, Practitioner, or Patient owner)
 */
router.get('/patients/:patientId/treatment-plans', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    const treatmentPlans = await getTreatmentPlansByPatient(patientId, req.user!);

    res.status(200).json(treatmentPlans);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get treatment plans';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get patient treatment plans error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get treatment plans',
    });
  }
});

export default router;
