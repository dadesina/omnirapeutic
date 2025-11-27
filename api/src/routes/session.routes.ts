/**
 * Session Routes
 *
 * REST API endpoints for session management (completed therapy sessions)
 */

import express, { Request, Response } from 'express';
import { Role, SessionStatus } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  completeAppointmentAndCreateSession,
  getSessionById,
  getAllSessions,
  getSessionsByPatientId,
  getSessionsByPractitionerId
} from '../services/session.service';
import { logAuditEvent } from '../services/audit.service';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /api/sessions:
 *   post:
 *     tags:
 *       - Sessions
 *     summary: Complete appointment and create session
 *     description: |
 *       Completes an appointment by creating a session record and consuming units from the authorization.
 *       This is an atomic operation that:
 *       1. Creates a session record
 *       2. Consumes units from the authorization
 *       3. Marks the appointment as completed
 *       Only administrators and practitioners can complete appointments.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointmentId
 *             properties:
 *               appointmentId:
 *                 type: string
 *                 format: uuid
 *               narrative:
 *                 type: string
 *                 description: Clinician's narrative notes
 *               latestMetrics:
 *                 type: object
 *                 description: Real-time aggregated metrics
 *               voiceNoteUrl:
 *                 type: string
 *                 description: URL to voice recording
 *               voiceTranscript:
 *                 type: string
 *                 description: Transcript of voice recording
 *     responses:
 *       '201':
 *         description: Session created successfully, units consumed
 *       '400':
 *         description: Bad Request - Validation error or appointment already completed
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Insufficient permissions
 *       '404':
 *         description: Appointment not found
 */
router.post(
  '/',
  requireRole([Role.ADMIN, Role.PRACTITIONER]),
  async (req: Request, res: Response) => {
    try {
      const result = await completeAppointmentAndCreateSession(req.body, req.user!);
      res.status(201).json(result);
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
 * /api/sessions:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get all sessions
 *     description: |
 *       Retrieves sessions with optional filtering.
 *       Patients can only see their own sessions.
 *       Practitioners and admins can see all sessions in their organization.
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
 *           enum: [IN_PROGRESS, COMPLETED, CANCELLED]
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
 *         description: A paginated list of sessions
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
      if (status) filters.status = status as SessionStatus;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const result = await getAllSessions(req.user!, filters);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'READ_SESSION',
        resource: 'session',
        organizationId: req.user!.organizationId!,
        details: {
          filters,
          resultCount: result.sessions.length
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
 * /api/sessions/{id}:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get session by ID
 *     description: Retrieves a single session by its ID with full details including events
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
 *         description: Session details
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Session not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const session = await getSessionById(req.params.id, req.user!);
    res.json(session);
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
 * /api/sessions/patient/{patientId}:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get sessions by patient ID
 *     description: Retrieves all sessions for a specific patient
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: List of sessions for the patient
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Patient not found
 */
router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const sessions = await getSessionsByPatientId(req.params.patientId, req.user!);

    // Audit log
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'READ_SESSION',
      resource: 'session',
      organizationId: req.user!.organizationId!,
      details: {
        patientId: req.params.patientId,
        resultCount: sessions.length
      }
    });

    res.json(sessions);
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
 * /api/sessions/practitioner/{practitionerId}:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get sessions by practitioner ID
 *     description: Retrieves all sessions for a specific practitioner. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: practitionerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: List of sessions for the practitioner
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - Admin only
 *       '404':
 *         description: Practitioner not found
 */
router.get(
  '/practitioner/:practitionerId',
  requireRole([Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const sessions = await getSessionsByPractitionerId(req.params.practitionerId, req.user!);

      // Audit log
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'READ_SESSION',
        resource: 'session',
        organizationId: req.user!.organizationId!,
        details: {
          practitionerId: req.params.practitionerId,
          resultCount: sessions.length
        }
      });

      res.json(sessions);
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
