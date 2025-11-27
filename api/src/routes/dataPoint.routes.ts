/**
 * Data Point Routes
 *
 * CRUD endpoints for Data Point management with RBAC
 * HIPAA Compliance: Data points are immutable once created
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  createDataPoint,
  bulkCreateDataPoints,
  getDataPointsByGoal,
  getDataPointsBySession,
  deleteDataPoint,
} from '../services/dataPoint.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';

const router = Router();

router.use(authenticateToken);
router.use(organizationScope);

/**
 * POST /api/data-points
 * Create data point (Admin and Practitioner only)
 */
router.post(
  '/data-points',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { goalId, progressNoteId, sessionId, value, unit, notes, date } = req.body;

      if (!goalId || value === undefined || !unit) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'goalId, value, and unit are required',
        });
        return;
      }

      if (typeof value !== 'number') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'value must be a number',
        });
        return;
      }

      const dataPoint = await createDataPoint(
        {
          goalId,
          progressNoteId,
          sessionId,
          value,
          unit: unit.trim(),
          notes,
          date: date ? new Date(date) : undefined,
        },
        req.user!
      );

      res.status(201).json(dataPoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create data point';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      console.error('Create data point error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create data point',
      });
    }
  }
);

/**
 * POST /api/data-points/bulk
 * Bulk create data points (Admin and Practitioner only)
 */
router.post(
  '/data-points/bulk',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { dataPoints } = req.body;

      if (!dataPoints || !Array.isArray(dataPoints) || dataPoints.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'dataPoints array is required and must contain at least one item',
        });
        return;
      }

      // Validate each data point
      for (const dp of dataPoints) {
        if (!dp.goalId || dp.value === undefined || !dp.unit) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'Each data point must have goalId, value, and unit',
          });
          return;
        }
        if (typeof dp.value !== 'number') {
          res.status(400).json({
            error: 'Bad Request',
            message: 'Each value must be a number',
          });
          return;
        }
      }

      const result = await bulkCreateDataPoints({ dataPoints }, req.user!);

      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bulk create data points';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      console.error('Bulk create data points error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to bulk create data points',
      });
    }
  }
);

/**
 * GET /api/goals/:goalId/data-points
 * Get data points by goal with pagination and date filtering
 */
router.get('/goals/:goalId/data-points', async (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (page < 1 || limit < 1 || limit > 100) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid pagination parameters',
      });
      return;
    }

    if (startDate && isNaN(startDate.getTime())) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'startDate must be a valid ISO 8601 date',
      });
      return;
    }

    if (endDate && isNaN(endDate.getTime())) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'endDate must be a valid ISO 8601 date',
      });
      return;
    }

    const result = await getDataPointsByGoal(goalId, req.user!, {
      page,
      limit,
      startDate,
      endDate,
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get data points';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get data points error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get data points',
    });
  }
});

/**
 * GET /api/sessions/:sessionId/data-points
 * Get data points by session
 */
router.get('/sessions/:sessionId/data-points', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const dataPoints = await getDataPointsBySession(sessionId, req.user!);

    res.status(200).json(dataPoints);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get data points';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get data points error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get data points',
    });
  }
});

/**
 * DELETE /api/data-points/:id
 * Delete data point (ADMIN only - for error correction)
 */
router.delete(
  '/data-points/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await deleteDataPoint(id, req.user!);

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete data point';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      console.error('Delete data point error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete data point',
      });
    }
  }
);

export default router;
