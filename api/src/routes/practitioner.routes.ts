/**
 * Practitioner Routes
 *
 * CRUD endpoints for Practitioner management with RBAC and audit logging
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  createPractitioner,
  getAllPractitioners,
  getPractitionerById,
  updatePractitioner,
  deletePractitioner
} from '../services/practitioner.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import prisma from '../config/database';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * POST /api/practitioners
 * Create a new practitioner (Admin only)
 */
router.post(
  '/',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { userId, firstName, lastName, licenseNumber, specialization, phoneNumber } = req.body;

      // Validate required fields
      if (!userId || !firstName || !lastName || !licenseNumber || !specialization) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'userId, firstName, lastName, licenseNumber, and specialization are required'
        });
        return;
      }

      // Create practitioner
      const practitioner = await createPractitioner(
        {
          userId,
          firstName,
          lastName,
          licenseNumber,
          specialization,
          phoneNumber
        },
        req.user!
      );

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'CREATE',
          resource: 'practitioners',
          resourceId: practitioner.id,
          details: { practitionerId: practitioner.id, licenseNumber: practitioner.licenseNumber },
          ipAddress: req.ip
        }
      });

      res.status(201).json({ practitioner });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create practitioner';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('already exists') || message.includes('Unique constraint')) {
        res.status(409).json({
          error: 'Conflict',
          message: 'License number already exists'
        });
        return;
      }

      console.error('Create practitioner error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create practitioner'
      });
    }
  }
);

/**
 * GET /api/practitioners
 * Get all practitioners with pagination (Admin and Practitioner)
 */
router.get(
  '/',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const specialization = req.query.specialization as string;

      const result = await getAllPractitioners(req.user!, { page, limit, search, specialization });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'READ',
          resource: 'practitioners',
          details: { action: 'list', page, limit, count: result.practitioners.length },
          ipAddress: req.ip
        }
      });

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get practitioners';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      console.error('Get practitioners error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get practitioners'
      });
    }
  }
);

/**
 * GET /api/practitioners/:id
 * Get practitioner by ID (All authenticated users)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const practitioner = await getPractitionerById(id, req.user!);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'READ',
        resource: 'practitioners',
        resourceId: id,
        details: { practitionerId: id, licenseNumber: practitioner.licenseNumber },
        ipAddress: req.ip
      }
    });

    res.status(200).json({ practitioner });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get practitioner';

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: 'Practitioner not found' });
      return;
    }

    console.error('Get practitioner error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get practitioner'
    });
  }
});

/**
 * PUT /api/practitioners/:id
 * Update practitioner (Admin or Own Profile)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, specialization, phoneNumber } = req.body;

    const practitioner = await updatePractitioner(
      id,
      { firstName, lastName, specialization, phoneNumber },
      req.user!
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'UPDATE',
        resource: 'practitioners',
        resourceId: id,
        details: {
          practitionerId: id,
          changes: { firstName, lastName, specialization, phoneNumber }
        },
        ipAddress: req.ip
      }
    });

    res.status(200).json({ practitioner });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update practitioner';

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: 'Practitioner not found' });
      return;
    }

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    console.error('Update practitioner error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update practitioner'
    });
  }
});

/**
 * DELETE /api/practitioners/:id
 * Delete practitioner (Admin only)
 */
router.delete(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await deletePractitioner(id, req.user!);

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'DELETE',
          resource: 'practitioners',
          resourceId: id,
          details: { practitionerId: id },
          ipAddress: req.ip
        }
      });

      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete practitioner';

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: 'Practitioner not found' });
        return;
      }

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      console.error('Delete practitioner error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete practitioner'
      });
    }
  }
);

export default router;
