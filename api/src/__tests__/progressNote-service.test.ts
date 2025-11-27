/**
 * Progress Note Service Unit Tests
 *
 * Tests business logic for progress note management
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser, userToJwtPayload } from './helpers/auth.helper';
import { createTestTreatmentPlan, createTestProgressNote } from './helpers/treatmentPlan.helper';
import { createTestSession } from './helpers/session.helper';
import {
  createProgressNote,
  getProgressNoteBySession,
  updateProgressNote,
  getProgressNotesByTreatmentPlan,
} from '../services/progressNote.service';

describe('Progress Note Service', () => {
  describe('createProgressNote', () => {
    it('should create a progress note with valid input', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      const result = await createProgressNote(
        {
          sessionId: session.id,
          narrative: 'Patient demonstrated significant progress during session.',
          behaviorObservations: 'Patient was engaged and cooperative.',
          interventionsUsed: 'Discrete trial training, natural environment teaching',
          recommendedAdjustments: 'Continue current intervention strategies',
        },
        userToJwtPayload(admin)
      );

      expect(result.id).toBeDefined();
      expect(result.narrative).toBe('Patient demonstrated significant progress during session.');
      expect(result.sessionId).toBe(session.id);
      expect(result.organizationId).toBe(admin.organizationId);
    });

    it('should create progress note with treatment plan link', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });
      const session = await createTestSession({
        organizationId: admin.organizationId!,
        patientId: treatmentPlan.patientId,
      });

      const result = await createProgressNote(
        {
          sessionId: session.id,
          treatmentPlanId: treatmentPlan.id,
          narrative: 'Session progress note',
        },
        userToJwtPayload(admin)
      );

      expect(result.treatmentPlanId).toBe(treatmentPlan.id);
    });

    it('should allow PRACTITIONER role to create progress notes', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const session = await createTestSession({
        organizationId: practitioner.organizationId!,
      });

      const result = await createProgressNote(
        {
          sessionId: session.id,
          narrative: 'Progress note created by practitioner',
        },
        userToJwtPayload(practitioner)
      );

      expect(result.id).toBeDefined();
    });

    it('should reject PATIENT role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const session = await createTestSession({
        organizationId: patientUser.organizationId!,
      });

      await expect(
        createProgressNote(
          {
            sessionId: session.id,
            narrative: 'Test note',
          },
          userToJwtPayload(patientUser)
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin2.organizationId!,
      });

      await expect(
        createProgressNote(
          {
            sessionId: session.id,
            narrative: 'Test note',
          },
          userToJwtPayload(admin1)
        )
      ).rejects.toThrow('different organization');
    });

    it('should prevent duplicate progress notes for same session', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      // Create first progress note
      await createProgressNote(
        {
          sessionId: session.id,
          narrative: 'First note',
        },
        userToJwtPayload(admin)
      );

      // Attempt to create second progress note for same session
      await expect(
        createProgressNote(
          {
            sessionId: session.id,
            narrative: 'Second note',
          },
          userToJwtPayload(admin)
        )
      ).rejects.toThrow('already exists');
    });

    it('should return 404 for non-existent session', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        createProgressNote(
          {
            sessionId: 'non-existent-id',
            narrative: 'Test note',
          },
          userToJwtPayload(admin)
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('getProgressNoteBySession', () => {
    it('should retrieve progress note by session ID', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      const result = await getProgressNoteBySession(session.id, userToJwtPayload(admin));

      expect(result.id).toBe(progressNote.id);
      expect(result.sessionId).toBe(session.id);
      expect(result.session).toBeDefined();
    });

    it('should allow PRACTITIONER to view progress notes', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const session = await createTestSession({
        organizationId: practitioner.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await getProgressNoteBySession(session.id, userToJwtPayload(practitioner));

      expect(result.id).toBe(progressNote.id);
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

      await expect(
        getProgressNoteBySession(session.id, userToJwtPayload(admin1))
      ).rejects.toThrow('different organization');
    });
  });

  describe('updateProgressNote', () => {
    it('should update progress note within 24-hour window', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
        narrative: 'Original narrative',
      });

      const result = await updateProgressNote(
        progressNote.id,
        {
          narrative: 'Updated narrative',
          behaviorObservations: 'Updated observations',
        },
        userToJwtPayload(admin)
      );

      expect(result.narrative).toBe('Updated narrative');
      expect(result.behaviorObservations).toBe('Updated observations');
    });

    it('should allow PRACTITIONER to update progress notes', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const session = await createTestSession({
        organizationId: practitioner.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: practitioner.organizationId!,
      });

      const result = await updateProgressNote(
        progressNote.id,
        { narrative: 'Updated by practitioner' },
        userToJwtPayload(practitioner)
      );

      expect(result.narrative).toBe('Updated by practitioner');
    });

    it('should reject PATIENT role', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin.organizationId!,
      });

      await expect(
        updateProgressNote(
          progressNote.id,
          { narrative: 'Updated' },
          userToJwtPayload(patientUser)
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should prevent updates after 24-hour window', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin.organizationId!,
      });

      // Create progress note with createdAt set to 25 hours ago
      const twentyFiveHoursAgo = new Date();
      twentyFiveHoursAgo.setHours(twentyFiveHoursAgo.getHours() - 25);

      const progressNote = await prisma.progressNote.create({
        data: {
          sessionId: session.id,
          organizationId: admin.organizationId!,
          createdByUserId: admin.id,
          narrative: 'Old progress note',
          createdAt: twentyFiveHoursAgo,
        },
      });

      await expect(
        updateProgressNote(
          progressNote.id,
          { narrative: 'Updated' },
          userToJwtPayload(admin)
        )
      ).rejects.toThrow('24 hours');
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const session = await createTestSession({
        organizationId: admin2.organizationId!,
      });
      const progressNote = await createTestProgressNote({
        sessionId: session.id,
        organizationId: admin2.organizationId!,
      });

      await expect(
        updateProgressNote(
          progressNote.id,
          { narrative: 'Updated' },
          userToJwtPayload(admin1)
        )
      ).rejects.toThrow('different organization');
    });
  });

  describe('getProgressNotesByTreatmentPlan', () => {
    it('should retrieve all progress notes for a treatment plan', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      // Create two sessions with progress notes
      const session1 = await createTestSession({
        organizationId: admin.organizationId!,
        patientId: treatmentPlan.patientId,
      });
      const session2 = await createTestSession({
        organizationId: admin.organizationId!,
        patientId: treatmentPlan.patientId,
      });

      await createTestProgressNote({
        sessionId: session1.id,
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });
      await createTestProgressNote({
        sessionId: session2.id,
        organizationId: admin.organizationId!,
        treatmentPlanId: treatmentPlan.id,
      });

      const result = await getProgressNotesByTreatmentPlan(
        treatmentPlan.id,
        userToJwtPayload(admin)
      );

      expect(result.progressNotes).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.progressNotes.every((pn: any) => pn.treatmentPlanId === treatmentPlan.id)).toBe(true);
    });

    it('should support pagination', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      // Create 3 sessions with progress notes
      for (let i = 0; i < 3; i++) {
        const session = await createTestSession({
          organizationId: admin.organizationId!,
          patientId: treatmentPlan.patientId,
        });
        await createTestProgressNote({
          sessionId: session.id,
          organizationId: admin.organizationId!,
          treatmentPlanId: treatmentPlan.id,
        });
      }

      const result = await getProgressNotesByTreatmentPlan(
        treatmentPlan.id,
        userToJwtPayload(admin),
        { page: 1, limit: 2 }
      );

      expect(result.progressNotes).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(2);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await expect(
        getProgressNotesByTreatmentPlan(treatmentPlan.id, userToJwtPayload(admin1))
      ).rejects.toThrow('different organization');
    });
  });
});
