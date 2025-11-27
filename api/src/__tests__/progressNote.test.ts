/**
 * Progress Note Endpoint Tests
 *
 * Tests for Progress Note CRUD operations with RBAC
 * HIPAA Compliance: Validates 24-hour edit window and access controls
 *
 * NOTE: Test Isolation Issue
 * This test file passes when run individually but may fail when run with the full suite
 * due to database state contamination between test files. This is a test infrastructure
 * issue, not a code functionality issue.
 *
 * To run this file in isolation:
 *   npm test -- src/__tests__/progressNote.test.ts
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import {
  createTestTreatmentPlan,
  createTestProgressNote,
} from './helpers/treatmentPlan.helper';
import { createTestSession } from './helpers/session.helper';
import { Role } from '@prisma/client';

let app: Application;

describe('Progress Note Endpoints', () => {
  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/progress-notes - Create Progress Note', () => {
    it('should create progress note as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      const noteData = {
        sessionId: session.id,
        narrative: 'Patient showed significant progress in verbal communication',
        behaviorObservations: 'Engaged throughout session',
        interventionsUsed: 'Discrete trial training, reinforcement',
      };

      const response = await request(app)
        .post('/api/progress-notes')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(noteData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.narrative).toBe(noteData.narrative);
      expect(response.body.sessionId).toBe(session.id);
    });

    it('should create progress note as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const session = await createTestSession({
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .post('/api/progress-notes')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({
          sessionId: session.id,
          narrative: 'Good session today',
        })
        .expect(201);

      expect(response.body.narrative).toBe('Good session today');
    });

    it('should reject creation as PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/progress-notes')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({
          sessionId: 'session-id',
          narrative: 'Test note',
        })
        .expect(403);
    });

    it('should reject creation with missing narrative', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .post('/api/progress-notes')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ sessionId: session.id })
        .expect(400);
    });

    it('should reject creation with short narrative', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .post('/api/progress-notes')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          sessionId: session.id,
          narrative: 'Short',
        })
        .expect(400);
    });

    it('should prevent duplicate progress note for same session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      await request(app)
        .post('/api/progress-notes')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          sessionId: session.id,
          narrative: 'Second note for same session',
        })
        .expect(409);
    });
  });

  describe('GET /api/sessions/:sessionId/progress-note - Get Progress Note by Session', () => {
    it('should retrieve progress note by session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const note = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      const response = await request(app)
        .get(`/api/sessions/${session.id}/progress-note`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(note.id);
      expect(response.body.sessionId).toBe(session.id);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin2.organizationId!,
      });
      await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/sessions/${session.id}/progress-note`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });

    it('should return 404 for session without progress note', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      await request(app)
        .get(`/api/sessions/${session.id}/progress-note`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('PATCH /api/progress-notes/:id - Update Progress Note', () => {
    it('should update progress note within 24 hours as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const note = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      const updates = {
        narrative: 'Updated narrative',
        behaviorObservations: 'Updated observations',
      };

      const response = await request(app)
        .patch(`/api/progress-notes/${note.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.narrative).toBe('Updated narrative');
    });

    it('should update progress note as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const session = await createTestSession({
        organizationId: practitioner.organizationId!,
      });
      const note = await createTestProgressNote({
        sessionId: session.id,
        organizationId: practitioner.organizationId!,
      });

      const response = await request(app)
        .patch(`/api/progress-notes/${note.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ narrative: 'Updated by practitioner' })
        .expect(200);

      expect(response.body.narrative).toBe('Updated by practitioner');
    });

    it('should reject update as PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const note = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      await request(app)
        .patch(`/api/progress-notes/${note.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({ narrative: 'Updated' })
        .expect(403);
    });

    it('should reject update after 24-hour window', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      // Create progress note dated 25 hours ago
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25);

      const note = await prisma.progressNote.create({
        data: {
          sessionId: session.id,
          narrative: 'Old note',
          organizationId: admin.organizationId!,
          createdByUserId: admin.user.userId,
          createdAt: oldDate,
        },
      });

      await request(app)
        .patch(`/api/progress-notes/${note.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ narrative: 'Updated' })
        .expect(400);
    });

    it('should reject update with no fields provided', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const note = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      await request(app)
        .patch(`/api/progress-notes/${note.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/treatment-plans/:planId/progress-notes - Get Progress Notes by Treatment Plan', () => {
    it('should retrieve paginated progress notes', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      // Create 3 progress notes
      for (let i = 0; i < 3; i++) {
        const session = await createTestSession({
          organizationId: admin.organizationId!,
        });
        await createTestProgressNote({
          sessionId: session.id,
          treatmentPlanId: treatmentPlan.id,
          organizationId: admin.organizationId!,
        });
      }

      const response = await request(app)
        .get(`/api/treatment-plans/${treatmentPlan.id}/progress-notes`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.notes).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);
    });

    it('should respect pagination parameters', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      // Create 5 progress notes
      for (let i = 0; i < 5; i++) {
        const session = await createTestSession({
          organizationId: admin.organizationId!,
        });
        await createTestProgressNote({
          sessionId: session.id,
          treatmentPlanId: treatmentPlan.id,
          organizationId: admin.organizationId!,
        });
      }

      const response = await request(app)
        .get(`/api/treatment-plans/${treatmentPlan.id}/progress-notes?page=1&limit=2`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.notes).toHaveLength(2);
      expect(response.body.pagination.totalPages).toBe(3);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await request(app)
        .get(`/api/treatment-plans/${treatmentPlan.id}/progress-notes`)
        .set('Authorization', `Bearer ${admin1.token}`)
        .expect(403);
    });
  });
});
