/**
 * Progress Note Routes
 *
 * CRUD endpoints for Progress Note management with RBAC
 * HIPAA Compliance: 24-hour edit window, all access logged
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  createProgressNote,
  getProgressNoteBySession,
  updateProgressNote,
  getProgressNotesByTreatmentPlan,
} from '../services/progressNote.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { organizationScope } from '../middleware/organization-scope.middleware';

const router = Router();

router.use(authenticateToken);
router.use(organizationScope);

/**
 * POST /api/progress-notes
 * Create progress note (Admin and Practitioner only)
 */
router.post(
  '/progress-notes',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const {
        sessionId,
        treatmentPlanId,
        narrative,
        behaviorObservations,
        interventionsUsed,
        recommendedAdjustments,
      } = req.body;

      if (!sessionId || !narrative) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'sessionId and narrative are required',
        });
        return;
      }

      if (narrative.trim().length < 10) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Narrative must be at least 10 characters',
        });
        return;
      }

      const progressNote = await createProgressNote(
        {
          sessionId,
          treatmentPlanId,
          narrative: narrative.trim(),
          behaviorObservations,
          interventionsUsed,
          recommendedAdjustments,
        },
        req.user!
      );

      res.status(201).json(progressNote);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create progress note';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      if (message.includes('already exists')) {
        res.status(409).json({ error: 'Conflict', message });
        return;
      }

      console.error('Create progress note error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create progress note',
      });
    }
  }
);

/**
 * GET /api/sessions/:sessionId/progress-note
 * Get progress note by session
 */
router.get('/sessions/:sessionId/progress-note', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const progressNote = await getProgressNoteBySession(sessionId, req.user!);

    res.status(200).json(progressNote);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get progress note';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get progress note error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get progress note',
    });
  }
});

/**
 * PATCH /api/progress-notes/:id
 * Update progress note (Admin and Practitioner only, 24-hour window)
 */
router.patch(
  '/progress-notes/:id',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { narrative, behaviorObservations, interventionsUsed, recommendedAdjustments } = req.body;

      if (!narrative && !behaviorObservations && !interventionsUsed && !recommendedAdjustments) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'At least one field must be provided for update',
        });
        return;
      }

      if (narrative && narrative.trim().length < 10) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Narrative must be at least 10 characters',
        });
        return;
      }

      const updates: any = {};
      if (narrative) updates.narrative = narrative.trim();
      if (behaviorObservations !== undefined) updates.behaviorObservations = behaviorObservations;
      if (interventionsUsed !== undefined) updates.interventionsUsed = interventionsUsed;
      if (recommendedAdjustments !== undefined) updates.recommendedAdjustments = recommendedAdjustments;

      const progressNote = await updateProgressNote(id, updates, req.user!);

      res.status(200).json(progressNote);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update progress note';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message });
        return;
      }

      if (message.includes('24 hours')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Update progress note error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update progress note',
      });
    }
  }
);

/**
 * GET /api/treatment-plans/:planId/progress-notes
 * Get progress notes by treatment plan with pagination
 */
router.get('/treatment-plans/:planId/progress-notes', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (page < 1 || limit < 1 || limit > 100) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid pagination parameters',
      });
      return;
    }

    const result = await getProgressNotesByTreatmentPlan(planId, req.user!, { page, limit });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get progress notes';

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message });
      return;
    }

    console.error('Get progress notes error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get progress notes',
    });
  }
});

export default router;
