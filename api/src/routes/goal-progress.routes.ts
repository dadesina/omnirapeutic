/**
 * Goal Progress & Milestones API Routes
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * Implements 7 REST API endpoints for goal progress tracking and milestone management
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import * as milestoneService from '../services/goal-milestone.service';
import * as progressService from '../services/goal-progress.service';

const router = Router();

// ============================================================================
// MILESTONE ROUTES (4 endpoints)
// ============================================================================

/**
 * POST /api/goals/:goalId/milestones
 * Create a new milestone for a goal
 */
router.post('/:goalId/milestones', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const { description, targetDate } = req.body;

    const milestone = await milestoneService.createGoalMilestone(
      goalId,
      {
        description,
        targetDate: targetDate ? new Date(targetDate) : undefined,
      },
      req.user!
    );

    res.status(201).json(milestone);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * GET /api/goals/:goalId/milestones
 * Get all milestones for a goal
 */
router.get('/:goalId/milestones', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;

    const milestones = await milestoneService.getGoalMilestones(goalId, req.user!);

    res.json(milestones);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * PUT /api/goals/:goalId/milestones/:id
 * Update a milestone
 */
router.put('/:goalId/milestones/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, targetDate, achievedAt } = req.body;

    const milestone = await milestoneService.updateGoalMilestone(
      id,
      {
        description,
        targetDate: targetDate !== undefined ? (targetDate ? new Date(targetDate) : null) : undefined,
        achievedAt: achievedAt !== undefined ? (achievedAt ? new Date(achievedAt) : null) : undefined,
      },
      req.user!
    );

    res.json(milestone);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * DELETE /api/goals/:goalId/milestones/:id
 * Delete a milestone
 */
router.delete('/:goalId/milestones/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await milestoneService.deleteGoalMilestone(id, req.user!);

    res.json(result);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/goals/:goalId/milestones/stats
 * Get milestone statistics for a goal
 */
router.get('/:goalId/milestones/stats', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;

    const stats = await milestoneService.getGoalMilestoneStats(goalId, req.user!);

    res.json(stats);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /api/goals/:goalId/milestones/:id/achieve
 * Mark a milestone as achieved
 */
router.post('/:goalId/milestones/:id/achieve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const milestone = await milestoneService.achieveMilestone(id, req.user!);

    res.json(milestone);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// PROGRESS ROUTES (3 endpoints)
// ============================================================================

/**
 * POST /api/goals/:goalId/progress
 * Update goal progress
 */
router.post('/:goalId/progress', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const { progressPercentage, notes, method, sessionId, milestoneId } = req.body;

    const goal = await progressService.updateGoalProgress(
      goalId,
      {
        progressPercentage,
        notes,
        method,
        sessionId,
        milestoneId,
      },
      req.user!
    );

    res.json(goal);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * GET /api/goals/:goalId/progress/history
 * Get progress history for a goal
 */
router.get('/:goalId/progress/history', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const { startDate, endDate, limit } = req.query;

    const options: any = {};
    if (startDate) options.startDate = new Date(startDate as string);
    if (endDate) options.endDate = new Date(endDate as string);
    if (limit) options.limit = parseInt(limit as string, 10);

    const history = await progressService.getGoalProgressHistory(
      goalId,
      options,
      req.user!
    );

    res.json(history);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/goals/:goalId/progress/visualization
 * Get progress visualization data
 */
router.get('/:goalId/progress/visualization', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;

    const data = await progressService.getProgressVisualizationData(goalId, req.user!);

    res.json(data);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /api/goals/:goalId/progress/calculate
 * Calculate progress from milestones
 */
router.post('/:goalId/progress/calculate', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;

    const goal = await progressService.calculateProgressFromMilestones(goalId, req.user!);

    res.json(goal);
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        error: error.message,
      });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

export default router;
