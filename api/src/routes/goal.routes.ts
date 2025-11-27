/**
 * Goal Routes
 *
 * CRUD endpoints for Goal management with RBAC and audit logging
 * HIPAA Compliance: All access is logged for compliance
 */

import { Router, Request, Response } from 'express';
import { Role, GoalType } from '@prisma/client';
import {
  createGoal,
  getGoalById,
  getGoalsByTreatmentPlan,
  updateGoal,
  markGoalAsMet,
  calculateGoalProgress,
} from '../services/goal.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';

const router = Router();

// All routes require authentication and organization scoping
router.use(authenticateToken);
router.use(organizationScope);

/**
 * POST /api/goals
 * Create a new goal (Admin and Practitioner only)
 */
router.post(
  '/goals',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const {
        treatmentPlanId,
        title,
        description,
        goalType,
        domain,
        baseline,
        targetCriteria,
        measurementMethod,
      } = req.body;

      // Validate required fields
      if (!treatmentPlanId || !title || !description || !goalType || !domain || !targetCriteria || !measurementMethod) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'treatmentPlanId, title, description, goalType, domain, targetCriteria, and measurementMethod are required',
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

      // Validate goalType
      if (!Object.values(GoalType).includes(goalType)) {
        res.status(400).json({
          error: 'Bad Request',
          message: `goalType must be one of: ${Object.values(GoalType).join(', ')}`,
        });
        return;
      }

      // Create goal
      const goal = await createGoal(
        {
          treatmentPlanId,
          title: title.trim(),
          description,
          goalType,
          domain: domain.trim(),
          baseline: baseline || undefined,
          targetCriteria,
          measurementMethod,
        },
        req.user!
      );

      res.status(201).json(goal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create goal';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      console.error('Create goal error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create goal',
      });
    }
  }
);

/**
 * GET /api/goals/:id
 * Get goal by ID (Admin, Practitioner, or Patient owner)
 */
router.get('/goals/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const goal = await getGoalById(id, req.user!);

    res.status(200).json(goal);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get goal';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get goal error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get goal',
    });
  }
});

/**
 * GET /api/treatment-plans/:planId/goals
 * Get all goals for a treatment plan
 */
router.get('/treatment-plans/:planId/goals', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;

    const goals = await getGoalsByTreatmentPlan(planId, req.user!);

    res.status(200).json(goals);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get goals';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get goals error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get goals',
    });
  }
});

/**
 * PATCH /api/goals/:id
 * Update goal (Admin and Practitioner only)
 */
router.patch(
  '/goals/:id',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, description, domain, baseline, targetCriteria, measurementMethod } = req.body;

      // Validate at least one field provided
      if (!title && !description && !domain && !baseline && !targetCriteria && !measurementMethod) {
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

      const updates: any = {};
      if (title) updates.title = title.trim();
      if (description) updates.description = description;
      if (domain) updates.domain = domain.trim();
      if (baseline !== undefined) updates.baseline = baseline;
      if (targetCriteria) updates.targetCriteria = targetCriteria;
      if (measurementMethod) updates.measurementMethod = measurementMethod;

      const goal = await updateGoal(id, updates, req.user!);

      res.status(200).json(goal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update goal';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      if (message.includes('Cannot update') || message.includes('met or discontinued')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Update goal error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update goal',
      });
    }
  }
);

/**
 * POST /api/goals/:id/mark-met
 * Mark goal as met (Admin and Practitioner only)
 */
router.post(
  '/goals/:id/mark-met',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const goal = await markGoalAsMet(id, req.user!);

      res.status(200).json(goal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark goal as met';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      if (message.includes('Can only mark')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Mark goal as met error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to mark goal as met',
      });
    }
  }
);

/**
 * GET /api/goals/:id/progress
 * Calculate goal progress
 */
router.get('/goals/:id/progress', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const progress = await calculateGoalProgress(id, req.user!);

    res.status(200).json(progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate goal progress';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Calculate goal progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to calculate goal progress',
    });
  }
});

export default router;
