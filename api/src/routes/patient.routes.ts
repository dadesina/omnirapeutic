/**
 * Patient Routes
 *
 * CRUD endpoints for Patient management with RBAC and audit logging
 * All PHI access is logged for HIPAA compliance
 */

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  createPatient,
  getAllPatients,
  getPatientById,
  updatePatient,
  deletePatient
} from '../services/patient.service';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import prisma from '../config/database';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * POST /api/patients
 * Create a new patient (Admin only)
 */
router.post(
  '/',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { userId, firstName, lastName, dateOfBirth, medicalRecordNumber, phoneNumber, address } = req.body;

      // Validate required fields
      if (!userId || !firstName || !lastName || !dateOfBirth || !medicalRecordNumber) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'userId, firstName, lastName, dateOfBirth, and medicalRecordNumber are required'
        });
        return;
      }

      // Create patient
      const patient = await createPatient(
        {
          userId,
          firstName,
          lastName,
          dateOfBirth,
          medicalRecordNumber,
          phoneNumber,
          address
        },
        req.user!
      );

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'CREATE',
          resource: 'patients',
          resourceId: patient.id,
          details: { patientId: patient.id, medicalRecordNumber: patient.medicalRecordNumber },
          ipAddress: req.ip
        }
      });

      res.status(201).json({ patient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create patient';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('already exists') || message.includes('Unique constraint')) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Medical record number already exists'
        });
        return;
      }

      if (message.includes('Date of birth')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Create patient error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create patient'
      });
    }
  }
);

/**
 * GET /api/patients
 * Get all patients with pagination (Admin and Practitioner)
 */
router.get(
  '/',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;

      const result = await getAllPatients(req.user!, { page, limit, search });

      // Audit log - PHI access
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'READ',
          resource: 'patients',
          details: { action: 'list', page, limit, count: result.patients.length },
          ipAddress: req.ip
        }
      });

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get patients';

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      console.error('Get patients error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get patients'
      });
    }
  }
);

/**
 * GET /api/patients/:id
 * Get patient by ID (Admin, Practitioner, or Owner)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const patient = await getPatientById(id, req.user!);

    // Audit log - PHI access
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'READ',
        resource: 'patients',
        resourceId: id,
        details: { patientId: id, medicalRecordNumber: patient.medicalRecordNumber },
        ipAddress: req.ip
      }
    });

    res.status(200).json({ patient });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get patient';

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
      return;
    }

    if (message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message });
      return;
    }

    console.error('Get patient error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient'
    });
  }
});

/**
 * PUT /api/patients/:id
 * Update patient (Admin only)
 */
router.put(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { firstName, lastName, dateOfBirth, phoneNumber, address } = req.body;

      const patient = await updatePatient(
        id,
        { firstName, lastName, dateOfBirth, phoneNumber, address },
        req.user!
      );

      // Audit log - PHI modification
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'UPDATE',
          resource: 'patients',
          resourceId: id,
          details: {
            patientId: id,
            changes: { firstName, lastName, dateOfBirth, phoneNumber, address }
          },
          ipAddress: req.ip
        }
      });

      res.status(200).json({ patient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update patient';

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
        return;
      }

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      if (message.includes('Date of birth')) {
        res.status(400).json({ error: 'Bad Request', message });
        return;
      }

      console.error('Update patient error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update patient'
      });
    }
  }
);

/**
 * DELETE /api/patients/:id
 * Delete patient (Admin only)
 */
router.delete(
  '/:id',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await deletePatient(id, req.user!);

      // Audit log - PHI deletion
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'DELETE',
          resource: 'patients',
          resourceId: id,
          details: { patientId: id },
          ipAddress: req.ip
        }
      });

      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete patient';

      if (message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
        return;
      }

      if (message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message });
        return;
      }

      console.error('Delete patient error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete patient'
      });
    }
  }
);

export default router;
