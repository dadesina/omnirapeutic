/**
 * Session Template Routes Tests
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * Tests for session template management API endpoints
 * Covers RBAC, multi-tenancy, and complete CRUD operations for session templates
 */

import request from 'supertest';
import { Application } from 'express';
import { Role, TemplateCategory } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import type { SessionTemplateStructure } from '../types/phase7b2.types';

let app: Application;

describe('Session Template Routes', () => {
  let org1Id: string;
  let org2Id: string;
  let adminUser: any;
  let adminToken: string;
  let practitionerUser: any;
  let practitionerToken: string;
  let rbtUser: any;
  let rbtToken: string;
  let patientUser: any;
  let patientToken: string;
  let org2AdminUser: any;
  let org2AdminToken: string;

  // Sample valid template structure
  const validTemplateStructure: SessionTemplateStructure = {
    version: '1.0',
    fields: [
      {
        id: 'session_date',
        label: 'Session Date',
        type: 'date',
        required: true,
        order: 1,
      },
      {
        id: 'duration',
        label: 'Session Duration (minutes)',
        type: 'number',
        required: true,
        validation: {
          min: 15,
          max: 180,
        },
        order: 2,
      },
      {
        id: 'target_behavior',
        label: 'Target Behavior',
        type: 'select',
        required: true,
        options: ['Communication', 'Social Skills', 'Self-Care', 'Academic'],
        order: 3,
      },
      {
        id: 'notes',
        label: 'Session Notes',
        type: 'textarea',
        required: false,
        order: 4,
      },
    ],
    sections: ['Session Info', 'Behavioral Data'],
    metadata: {
      estimatedDuration: 30,
      tags: ['ABA', 'Behavioral'],
    },
  };

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    // Create test organizations
    const org1 = await prisma.organization.create({
      data: { name: 'Test Org 1' },
    });
    org1Id = org1.id;

    const org2 = await prisma.organization.create({
      data: { name: 'Test Org 2' },
    });
    org2Id = org2.id;

    // Create users for org1
    const admin = await createTestUser(Role.ADMIN, false, org1Id);
    adminUser = admin.user;
    adminToken = admin.token;

    const practitioner = await createTestUser(Role.PRACTITIONER, false, org1Id);
    practitionerUser = practitioner.user;
    practitionerToken = practitioner.token;

    const rbt = await createTestUser(Role.RBT, false, org1Id);
    rbtUser = rbt.user;
    rbtToken = rbt.token;

    const patient = await createTestUser(Role.PATIENT, false, org1Id);
    patientUser = patient.user;
    patientToken = patient.token;

    // Create admin for org2 (for multi-tenant isolation tests)
    const org2Admin = await createTestUser(Role.ADMIN, false, org2Id);
    org2AdminUser = org2Admin.user;
    org2AdminToken = org2Admin.token;
  });

  describe('POST /api/session-templates', () => {
    it('should create template as ADMIN', async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Standard ABA Session',
          description: 'Template for standard ABA therapy sessions',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Standard ABA Session');
      expect(response.body.category).toBe(TemplateCategory.PROGRESS_NOTE);
      expect(response.body.isActive).toBe(true);
      expect(response.body.organizationId).toBe(org1Id);
      expect(response.body.structure).toEqual(validTemplateStructure);
    });

    it('should create template as PRACTITIONER', async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${practitionerToken}`)
        .send({
          name: 'BCBA Assessment Template',
          category: TemplateCategory.ASSESSMENT,
          structure: validTemplateStructure,
        })
        .expect(201);

      expect(response.body.name).toBe('BCBA Assessment Template');
    });

    it('should reject when missing required fields', async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Incomplete Template',
          // Missing category and structure
        })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('required');
    });

    it('should reject invalid template structure', async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: {
            version: '1.0',
            fields: [], // Empty fields array (invalid - must have at least one)
          },
        })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('Invalid template structure');
    });

    it('should reject when unauthorized role (RBT)', async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${rbtToken}`)
        .send({
          name: 'RBT Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject when unauthorized role (PATIENT)', async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          name: 'Patient Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject duplicate template names within organization', async () => {
      await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Template',
          category: TemplateCategory.ASSESSMENT,
          structure: validTemplateStructure,
        })
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already exists');
    });

    it('should allow same template name in different organizations', async () => {
      await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Shared Template Name',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .send({
          name: 'Shared Template Name',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      expect(response.body.organizationId).toBe(org2Id);
    });

    it('should reject when unauthenticated', async () => {
      await request(app)
        .post('/api/session-templates')
        .send({
          name: 'Test Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(401);
    });

    it('should validate field order uniqueness', async () => {
      const invalidStructure: SessionTemplateStructure = {
        version: '1.0',
        fields: [
          {
            id: 'field1',
            label: 'Field 1',
            type: 'text',
            required: true,
            order: 1,
          },
          {
            id: 'field2',
            label: 'Field 2',
            type: 'text',
            required: true,
            order: 1, // Duplicate order
          },
        ],
      };

      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Order Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: invalidStructure,
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid template structure');
      expect(response.body.message).toContain('order');
    });

    it('should require options for select fields', async () => {
      const invalidStructure: SessionTemplateStructure = {
        version: '1.0',
        fields: [
          {
            id: 'select_field',
            label: 'Select Field',
            type: 'select',
            required: true,
            order: 1,
            // Missing options
          },
        ],
      };

      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Select Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: invalidStructure,
        })
        .expect(400);

      expect(response.body.message).toContain('options');
    });
  });

  describe('GET /api/session-templates', () => {
    beforeEach(async () => {
      // Create templates for org1
      await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'ABA Session Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        });

      await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Assessment Template',
          category: TemplateCategory.ASSESSMENT,
          structure: validTemplateStructure,
        });

      // Create template for org2
      await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .send({
          name: 'Org2 Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        });
    });

    it('should get all templates as ADMIN', async () => {
      const response = await request(app)
        .get('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body.every((t: any) => t.organizationId === org1Id)).toBe(true);
    });

    it('should get all templates as PRACTITIONER', async () => {
      const response = await request(app)
        .get('/api/session-templates')
        .set('Authorization', `Bearer ${practitionerToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should get templates as RBT', async () => {
      const response = await request(app)
        .get('/api/session-templates')
        .set('Authorization', `Bearer ${rbtToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should get templates as PATIENT', async () => {
      const response = await request(app)
        .get('/api/session-templates')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get(`/api/session-templates?category=${TemplateCategory.PROGRESS_NOTE}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].category).toBe(TemplateCategory.PROGRESS_NOTE);
    });

    it('should filter by isActive', async () => {
      const allResponse = await request(app)
        .get('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const templateId = allResponse.body[0].id;

      await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const activeResponse = await request(app)
        .get('/api/session-templates?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(activeResponse.body).toHaveLength(1);

      const inactiveResponse = await request(app)
        .get('/api/session-templates?isActive=false')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(inactiveResponse.body).toHaveLength(1);
      expect(inactiveResponse.body[0].isActive).toBe(false);
    });

    it('should search by name', async () => {
      const response = await request(app)
        .get('/api/session-templates?search=ABA')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toContain('ABA');
    });

    it('should enforce multi-tenant isolation', async () => {
      const response = await request(app)
        .get('/api/session-templates')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Org2 Template');
    });

    it('should reject when unauthenticated', async () => {
      await request(app)
        .get('/api/session-templates')
        .expect(401);
    });
  });

  describe('GET /api/session-templates/:id', () => {
    let templateId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      templateId = response.body.id;
    });

    it('should get template by ID as ADMIN', async () => {
      const response = await request(app)
        .get(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(templateId);
      expect(response.body.name).toBe('Test Template');
    });

    it('should get template by ID as PRACTITIONER', async () => {
      const response = await request(app)
        .get(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${practitionerToken}`)
        .expect(200);

      expect(response.body.id).toBe(templateId);
    });

    it('should return 404 when template does not exist', async () => {
      const response = await request(app)
        .get('/api/session-templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });

    it('should enforce multi-tenant isolation', async () => {
      const response = await request(app)
        .get(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject when unauthenticated', async () => {
      await request(app)
        .get(`/api/session-templates/${templateId}`)
        .expect(401);
    });
  });

  describe('GET /api/session-templates/:id/stats', () => {
    let templateId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Stats Template',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      templateId = response.body.id;
    });

    it('should get template stats', async () => {
      const response = await request(app)
        .get(`/api/session-templates/${templateId}/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.templateId).toBe(templateId);
      expect(response.body.name).toBe('Stats Template');
      expect(response.body.fieldCount).toBe(4);
      expect(response.body.sectionCount).toBe(2);
      expect(response.body.requiredFieldCount).toBe(3);
      expect(response.body.documentationCount).toBe(0);
    });

    it('should reject when template does not exist', async () => {
      await request(app)
        .get('/api/session-templates/00000000-0000-0000-0000-000000000000/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/session-templates/:id', () => {
    let templateId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Original Template',
          description: 'Original description',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      templateId = response.body.id;
    });

    it('should update template as ADMIN', async () => {
      const response = await request(app)
        .put(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Template',
          description: 'Updated description',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Template');
      expect(response.body.description).toBe('Updated description');
    });

    it('should update template as PRACTITIONER', async () => {
      const response = await request(app)
        .put(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${practitionerToken}`)
        .send({
          name: 'BCBA Updated Template',
        })
        .expect(200);

      expect(response.body.name).toBe('BCBA Updated Template');
    });

    it('should reject when unauthorized role (RBT)', async () => {
      const response = await request(app)
        .put(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${rbtToken}`)
        .send({
          name: 'RBT Update',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject invalid structure update', async () => {
      const response = await request(app)
        .put(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          structure: {
            version: '1.0',
            fields: [], // Invalid - empty fields
          },
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid template structure');
    });

    it('should reject duplicate name within organization', async () => {
      await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Another Template',
          category: TemplateCategory.ASSESSMENT,
          structure: validTemplateStructure,
        })
        .expect(201);

      const response = await request(app)
        .put(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Another Template',
        })
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already exists');
    });

    it('should return 404 when template does not exist', async () => {
      await request(app)
        .put('/api/session-templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
        })
        .expect(404);
    });

    it('should enforce multi-tenant isolation', async () => {
      const response = await request(app)
        .put(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .send({
          name: 'Org2 Update',
        })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject when unauthenticated', async () => {
      await request(app)
        .put(`/api/session-templates/${templateId}`)
        .send({
          name: 'Update',
        })
        .expect(401);
    });
  });

  describe('DELETE /api/session-templates/:id', () => {
    let templateId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/session-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Template to Delete',
          category: TemplateCategory.PROGRESS_NOTE,
          structure: validTemplateStructure,
        })
        .expect(201);

      templateId = response.body.id;
    });

    it('should deactivate template as ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should deactivate template as PRACTITIONER', async () => {
      const response = await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${practitionerToken}`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should reject when unauthorized role (RBT)', async () => {
      const response = await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${rbtToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 when template does not exist', async () => {
      await request(app)
        .delete('/api/session-templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should reject when template is already deactivated', async () => {
      await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const response = await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already deactivated');
    });

    it('should enforce multi-tenant isolation', async () => {
      const response = await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject when unauthenticated', async () => {
      await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .expect(401);
    });

    it('should preserve template data after deactivation', async () => {
      const response = await request(app)
        .delete(`/api/session-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.name).toBe('Template to Delete');
      expect(response.body.structure).toEqual(validTemplateStructure);
    });
  });

  describe('POST /api/session-templates/validate', () => {
    it('should validate valid structure', async () => {
      const response = await request(app)
        .post('/api/session-templates/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          structure: validTemplateStructure,
        })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should reject invalid structure', async () => {
      const response = await request(app)
        .post('/api/session-templates/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          structure: {
            version: '1.0',
            fields: [], // Invalid
          },
        })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should reject when structure is missing', async () => {
      await request(app)
        .post('/api/session-templates/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('should reject when unauthenticated', async () => {
      await request(app)
        .post('/api/session-templates/validate')
        .send({
          structure: validTemplateStructure,
        })
        .expect(401);
    });
  });
});
