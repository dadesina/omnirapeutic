/**
 * Appointment Routes
 *
 * REST API endpoints for appointment management with authorization unit integration
 */

import express, { Request, Response } from 'express';
import { Role, AppointmentStatus } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  createAppointment,
  getAppointmentById,
  getAllAppointments,
  updateAppointment,
  cancelAppointment,
  startAppointment
} from '../services/appointment.service';
import { logAuditEvent } from '../services/audit.service';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /api/appointments:
 *   post:
 *     tags:
 *       - Appointments
 *     summary: Create a new appointment
 *     description: |
 *       Creates a new appointment and automatically reserves units from the authorization.
 *       Only administrators and practitioners can create appointments.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - practitionerId
 *               - serviceCodeId
 *               - authorizationId
 *               - startTime
 *               - endTime
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               practitionerId:
 *                 type: string
 *                 format: uuid
 *               serviceCodeId:
 *                 type: string
 *                 format: uuid
 *               authorizationId:
 *                 type: string
 *                 format: uuid
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *               recurrenceRule:
 *                 type: string
 *                 description: RRule format for recurring appointments
 *     responses:
 *       '201':
 *         description: Appointment created successfully
 *       '400':
 *         description: Bad Request - Validation error or insufficient units
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Insufficient permissions
 *       '404':
 *         description: Resource not found
 */
router.post(
  '/',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      // Parse date strings to Date objects
      const appointmentData = {
        ...req.body,
        startTime: new Date(req.body.startTime),
        endTime: new Date(req.body.endTime),
      };
      const appointment = await createAppointment(appointmentData, req.user!);
      res.status(201).json(appointment);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Not Found', message: error.message });
      } else if (error.message.includes('Insufficient units')) {
        res.status(400).json({ error: 'Insufficient Units', message: error.message });
      } else {
        res.status(400).json({ error: 'Bad Request', message: error.message });
      }
    }
  }
);

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     tags:
 *       - Appointments
 *     summary: Get all appointments
 *     description: |
 *       Retrieves appointments with optional filtering.
 *       Patients can only see their own appointments.
 *       Practitioners and admins can see all appointments in their organization.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: practitionerId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       '200':
 *         description: A paginated list of appointments
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 */
router.get(
  '/',
  requireRole([Role.ADMIN, Role.PRACTITIONER, Role.PATIENT]),
  async (req: Request, res: Response) => {
    try {
      const { page, limit, patientId, practitionerId, status, startDate, endDate } = req.query;

      const filters: any = {};
      if (page) filters.page = parseInt(page as string);
      if (limit) filters.limit = parseInt(limit as string);
      if (patientId) filters.patientId = patientId as string;
      if (practitionerId) filters.practitionerId = practitionerId as string;
      if (status) filters.status = status as AppointmentStatus;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const result = await getAllAppointments(req.user!, filters);

      // Audit log (use copies without Date objects for JSON serialization)
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'READ_APPOINTMENT',
        resource: 'appointment',
        organizationId: req.user!.organizationId!,
        details: {
          filters: {
            ...filters,
            startDate: filters.startDate?.toISOString(),
            endDate: filters.endDate?.toISOString(),
          },
          resultCount: result.appointments.length
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
 * /api/appointments/{id}:
 *   get:
 *     tags:
 *       - Appointments
 *     summary: Get appointment by ID
 *     description: Retrieves a single appointment by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Appointment details
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Appointment not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const appointment = await getAppointmentById(req.params.id, req.user!);
    res.json(appointment);
  } catch (error: any) {
    if (error.message.includes('Forbidden')) {
      res.status(403).json({ error: 'Forbidden', message: error.message });
    } else if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: error.message });
    } else {
      res.status(400).json({ error: 'Bad Request', message: error.message });
    }
  }
});

/**
 * @swagger
 * /api/appointments/{id}:
 *   put:
 *     tags:
 *       - Appointments
 *     summary: Update appointment
 *     description: |
 *       Updates appointment details (time, practitioner, notes).
 *       Cannot update status - use specific endpoints for status changes.
 *       Cannot update completed or cancelled appointments.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               practitionerId:
 *                 type: string
 *                 format: uuid
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Appointment updated successfully
 *       '400':
 *         description: Bad Request
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Appointment not found
 */
router.put(
  '/:id',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      // Parse date strings to Date objects if present
      const updateData: any = { ...req.body };
      if (req.body.startTime) {
        updateData.startTime = new Date(req.body.startTime);
      }
      if (req.body.endTime) {
        updateData.endTime = new Date(req.body.endTime);
      }
      const appointment = await updateAppointment(req.params.id, updateData, req.user!);
      res.json(appointment);
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
 * /api/appointments/{id}/cancel:
 *   post:
 *     tags:
 *       - Appointments
 *     summary: Cancel appointment
 *     description: |
 *       Cancels an appointment and automatically releases reserved units back to the authorization.
 *       Cannot cancel already completed or cancelled appointments.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Appointment cancelled successfully, units released
 *       '400':
 *         description: Bad Request - Cannot cancel this appointment
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Appointment not found
 */
router.post(
  '/:id/cancel',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const appointment = await cancelAppointment(req.params.id, req.user!);
      res.json(appointment);
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
 * /api/appointments/{id}/start:
 *   post:
 *     tags:
 *       - Appointments
 *     summary: Start appointment
 *     description: Changes appointment status to IN_PROGRESS
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Appointment started successfully
 *       '400':
 *         description: Bad Request - Cannot start this appointment
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Appointment not found
 */
router.post(
  '/:id/start',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const appointment = await startAppointment(req.params.id, req.user!);
      res.json(appointment);
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
