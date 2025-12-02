/**
 * Session Template Routes
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * CRUD endpoints for session templates and documentation
 */

import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { TemplateCategory } from '@prisma/client';
import {
  createSessionTemplate,
  getAllSessionTemplates,
  getSessionTemplateById,
  getSessionTemplatesByCategory,
  updateSessionTemplate,
  deactivateSessionTemplate,
  getTemplateStats,
  validateTemplateStructureOnly,
} from '../services/session-template.service';
import {
  createSessionDocumentation,
  getSessionDocumentation,
  getPatientSessionDocumentation,
  updateSessionDocumentation,
  renderDocumentationAsText,
  getPatientDocumentationStats,
} from '../services/session-documentation.service';

const router = express.Router();

// ============================================================================
// SESSION TEMPLATE ENDPOINTS
// ============================================================================

/**
 * POST /api/session-templates
 *
 * Create a new session template
 *
 * Security: JWT + ADMIN or PRACTITIONER role
 *
 * Request Body:
 * {
 *   "name": "ABA Progress Note",
 *   "description": "Standard progress note for sessions",
 *   "category": "PROGRESS_NOTE" | "ASSESSMENT" | "INTERVENTION" | "TRANSITION",
 *   "structure": {
 *     "version": "1.0.0",
 *     "fields": [...],
 *     "sections": ["Section 1", "Section 2"],
 *     "metadata": { ... }
 *   }
 * }
 *
 * Response 201:
 * {
 *   "id": "uuid",
 *   "organizationId": "uuid",
 *   "name": "ABA Progress Note",
 *   "description": "Standard progress note for sessions",
 *   "category": "PROGRESS_NOTE",
 *   "structure": { ... },
 *   "isActive": true,
 *   "createdBy": "uuid",
 *   "createdAt": "2025-12-02T...",
 *   "updatedAt": "2025-12-02T..."
 * }
 */
router.post(
  '/session-templates',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { name, description, category, structure } = req.body;

      // Validate required fields
      if (!name || !category || !structure) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: name, category, structure',
        });
      }

      // Validate category
      if (!Object.values(TemplateCategory).includes(category)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid category. Must be one of: ${Object.values(TemplateCategory).join(', ')}`,
        });
      }

      // Create template
      const template = await createSessionTemplate(
        {
          name,
          description,
          category,
          structure,
        },
        req.user!
      );

      res.status(201).json(template);
    } catch (error: any) {
      // Handle specific errors
      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
      }

      if (error.message.includes('Invalid template structure')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      console.error('Session template creation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create session template',
      });
    }
  }
);

/**
 * GET /api/session-templates
 *
 * Get all session templates for organization with optional filters
 *
 * Security: JWT (all authenticated users)
 *
 * Query Parameters:
 * - category?: PROGRESS_NOTE | ASSESSMENT | INTERVENTION | TRANSITION
 * - isActive?: true | false
 * - search?: string (searches name and description)
 *
 * Response 200:
 * [
 *   {
 *     "id": "uuid",
 *     "organizationId": "uuid",
 *     "name": "ABA Progress Note",
 *     "category": "PROGRESS_NOTE",
 *     "isActive": true,
 *     "createdAt": "2025-12-02T...",
 *     "updatedAt": "2025-12-02T..."
 *   },
 *   ...
 * ]
 */
router.get(
  '/session-templates',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { category, isActive, search } = req.query;

      // Build filters
      const filters: any = {};

      if (category) {
        if (!Object.values(TemplateCategory).includes(category as TemplateCategory)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: `Invalid category. Must be one of: ${Object.values(TemplateCategory).join(', ')}`,
          });
        }
        filters.category = category as TemplateCategory;
      }

      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }

      if (search) {
        filters.search = search as string;
      }

      const templates = await getAllSessionTemplates(filters, req.user!);

      res.status(200).json(templates);
    } catch (error: any) {
      console.error('Session template query error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve session templates',
      });
    }
  }
);

/**
 * GET /api/session-templates/:id
 *
 * Get session template by ID
 *
 * Security: JWT (all authenticated users in same organization)
 *
 * Response 200:
 * {
 *   "id": "uuid",
 *   "organizationId": "uuid",
 *   "name": "ABA Progress Note",
 *   "description": "Standard progress note",
 *   "category": "PROGRESS_NOTE",
 *   "structure": { version, fields, sections, metadata },
 *   "isActive": true,
 *   "createdBy": "uuid",
 *   "createdAt": "2025-12-02T...",
 *   "updatedAt": "2025-12-02T..."
 * }
 */
router.get(
  '/session-templates/:id',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const template = await getSessionTemplateById(id, req.user!);

      res.status(200).json(template);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('Session template retrieval error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve session template',
      });
    }
  }
);

/**
 * GET /api/session-templates/:id/stats
 *
 * Get template statistics (field count, usage count, etc.)
 *
 * Security: JWT (all authenticated users in same organization)
 *
 * Response 200:
 * {
 *   "templateId": "uuid",
 *   "name": "ABA Progress Note",
 *   "category": "PROGRESS_NOTE",
 *   "isActive": true,
 *   "fieldCount": 8,
 *   "sectionCount": 3,
 *   "requiredFieldCount": 5,
 *   "documentationCount": 42,
 *   "createdAt": "2025-12-02T...",
 *   "updatedAt": "2025-12-02T..."
 * }
 */
router.get(
  '/session-templates/:id/stats',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const stats = await getTemplateStats(id, req.user!);

      res.status(200).json(stats);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('Template stats retrieval error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve template statistics',
      });
    }
  }
);

/**
 * PUT /api/session-templates/:id
 *
 * Update an existing session template
 *
 * Security: JWT + ADMIN or PRACTITIONER role
 *
 * Request Body (all fields optional):
 * {
 *   "name": "Updated Template Name",
 *   "description": "Updated description",
 *   "category": "PROGRESS_NOTE",
 *   "structure": { ... }
 * }
 *
 * Response 200: Updated template object
 */
router.put(
  '/session-templates/:id',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, category, structure } = req.body;

      // Validate category if provided
      if (category && !Object.values(TemplateCategory).includes(category)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid category. Must be one of: ${Object.values(TemplateCategory).join(', ')}`,
        });
      }

      // Build update input
      const updateInput: any = {};
      if (name !== undefined) updateInput.name = name;
      if (description !== undefined) updateInput.description = description;
      if (category !== undefined) updateInput.category = category;
      if (structure !== undefined) updateInput.structure = structure;

      const updatedTemplate = await updateSessionTemplate(
        id,
        updateInput,
        req.user!
      );

      res.status(200).json(updatedTemplate);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
      }

      if (error.message.includes('Invalid template structure')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      console.error('Session template update error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update session template',
      });
    }
  }
);

/**
 * DELETE /api/session-templates/:id
 *
 * Deactivate a session template (soft delete)
 *
 * Security: JWT + ADMIN or PRACTITIONER role
 *
 * Response 200:
 * {
 *   "id": "uuid",
 *   "isActive": false,
 *   ...
 * }
 */
router.delete(
  '/session-templates/:id',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const deactivatedTemplate = await deactivateSessionTemplate(
        id,
        req.user!
      );

      res.status(200).json(deactivatedTemplate);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (error.message.includes('already deactivated')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
      }

      console.error('Session template deactivation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to deactivate session template',
      });
    }
  }
);

/**
 * POST /api/session-templates/validate
 *
 * Validate template structure without saving
 * Useful for frontend validation before submission
 *
 * Security: JWT + ADMIN or PRACTITIONER role
 *
 * Request Body:
 * {
 *   "structure": { ... }
 * }
 *
 * Response 200:
 * {
 *   "valid": true,
 *   "errors": []
 * }
 * or
 * {
 *   "valid": false,
 *   "errors": ["Field order values must be unique", "Field 'select-1' must have options"]
 * }
 */
router.post(
  '/session-templates/validate',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { structure } = req.body;

      if (!structure) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required field: structure',
        });
      }

      const validationResult = validateTemplateStructureOnly(structure);

      res.status(200).json(validationResult);
    } catch (error: any) {
      console.error('Template validation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to validate template structure',
      });
    }
  }
);

// ============================================================================
// SESSION DOCUMENTATION ENDPOINTS
// ============================================================================

/**
 * POST /api/sessions/:sessionId/documentation
 *
 * Create documentation for a session
 *
 * Security: JWT + ADMIN, PRACTITIONER, or RBT role
 *
 * Request Body:
 * {
 *   "templateId": "uuid",
 *   "content": {
 *     "templateVersion": "1.0.0",
 *     "fields": [
 *       { "fieldId": "field-001", "value": "2025-12-02" },
 *       { "fieldId": "field-002", "value": 60 }
 *     ],
 *     "completedAt": "2025-12-02T15:00:00Z",
 *     "completedBy": "uuid",
 *     "sessionDuration": 60,
 *     "metadata": { "location": "Clinic", ... }
 *   }
 * }
 *
 * Response 201: Documentation object with template and session includes
 */
router.post(
  '/sessions/:sessionId/documentation',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { templateId, content } = req.body;

      if (!templateId || !content) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: templateId, content',
        });
      }

      const documentation = await createSessionDocumentation(
        {
          sessionId,
          templateId,
          content,
        },
        req.user!
      );

      res.status(201).json(documentation);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
      }

      if (
        error.message.includes('Invalid documentation') ||
        error.message.includes('does not match template')
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      console.error('Session documentation creation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create session documentation',
      });
    }
  }
);

/**
 * GET /api/sessions/:sessionId/documentation
 *
 * Get documentation for a specific session
 *
 * Security: JWT (practitioners or patient/caregiver if their own session)
 *
 * Response 200: Documentation object with template and session includes
 */
router.get(
  '/sessions/:sessionId/documentation',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const documentation = await getSessionDocumentation(
        sessionId,
        req.user!
      );

      res.status(200).json(documentation);
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('No documentation')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('Session documentation retrieval error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve session documentation',
      });
    }
  }
);

/**
 * GET /api/sessions/:sessionId/documentation/export
 *
 * Export documentation as formatted text
 *
 * Security: JWT (practitioners or patient/caregiver if their own session)
 *
 * Response 200:
 * {
 *   "sessionId": "uuid",
 *   "formattedText": "Session Documentation\n=====================\n..."
 * }
 */
router.get(
  '/sessions/:sessionId/documentation/export',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const formattedText = await renderDocumentationAsText(
        sessionId,
        req.user!
      );

      res.status(200).json({
        sessionId,
        formattedText,
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('No documentation')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('Documentation export error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to export documentation',
      });
    }
  }
);

/**
 * PUT /api/sessions/:sessionId/documentation
 *
 * Update documentation for a session
 *
 * Security: JWT + ADMIN, PRACTITIONER, or RBT role
 *
 * Request Body:
 * {
 *   "content": { ... } // Updated content object
 * }
 *
 * Response 200: Updated documentation object
 */
router.put(
  '/sessions/:sessionId/documentation',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required field: content',
        });
      }

      const updatedDocumentation = await updateSessionDocumentation(
        sessionId,
        { content },
        req.user!
      );

      res.status(200).json(updatedDocumentation);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      if (
        error.message.includes('Invalid documentation') ||
        error.message.includes('does not match template')
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      console.error('Session documentation update error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update session documentation',
      });
    }
  }
);

/**
 * GET /api/patients/:patientId/documentation
 *
 * Get all session documentation for a patient
 *
 * Security: JWT (practitioners or patient/caregiver if their own data)
 *
 * Response 200: Array of documentation objects
 */
router.get(
  '/patients/:patientId/documentation',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { patientId } = req.params;

      const documentation = await getPatientSessionDocumentation(
        patientId,
        req.user!
      );

      res.status(200).json(documentation);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('Patient documentation retrieval error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve patient documentation',
      });
    }
  }
);

/**
 * GET /api/patients/:patientId/documentation/stats
 *
 * Get documentation statistics for a patient
 *
 * Security: JWT (practitioners or patient/caregiver if their own data)
 *
 * Response 200:
 * {
 *   "totalDocumentation": 42,
 *   "byCategory": {
 *     "PROGRESS_NOTE": 30,
 *     "ASSESSMENT": 8,
 *     "INTERVENTION": 3,
 *     "TRANSITION": 1
 *   },
 *   "latestDocumentation": "2025-12-02T...",
 *   "oldestDocumentation": "2025-01-15T..."
 * }
 */
router.get(
  '/patients/:patientId/documentation/stats',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { patientId } = req.params;

      const stats = await getPatientDocumentationStats(patientId, req.user!);

      res.status(200).json(stats);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      if (error.message.includes('Forbidden')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
      }

      console.error('Documentation stats retrieval error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve documentation statistics',
      });
    }
  }
);

export default router;
