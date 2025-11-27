/**
 * Treatment Plan Service Unit Tests
 *
 * Tests business logic for treatment plan management
 */

import { Role, TreatmentPlanStatus } from '@prisma/client';
import { prisma } from './setup';
import { createTestUser, userToJwtPayload } from './helpers/auth.helper';
import { createCompleteTestPatient } from './helpers/factories';
import { createTestAuthorization, createTestServiceCode } from './helpers/appointment.helper';
import { createTestTreatmentPlan } from './helpers/treatmentPlan.helper';
import {
  createTreatmentPlan,
  getTreatmentPlanById,
  getAllTreatmentPlans,
  updateTreatmentPlan,
  updateTreatmentPlanStatus,
  getTreatmentPlansByPatient,
} from '../services/treatmentPlan.service';

describe('Treatment Plan Service', () => {
  describe('createTreatmentPlan', () => {
    it('should create a treatment plan with valid input', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      const sixMonthsLater = new Date(now);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

      const result = await createTreatmentPlan(
        {
          patientId: patient.id,
          title: 'ABA Treatment Plan',
          description: 'Comprehensive treatment plan',
          startDate: now,
          endDate: sixMonthsLater,
          reviewDate: threeMonthsLater,
        },
        admin.user
      );

      expect(result.id).toBeDefined();
      expect(result.title).toBe('ABA Treatment Plan');
      expect(result.status).toBe(TreatmentPlanStatus.DRAFT);
      expect(result.patientId).toBe(patient.id);
      expect(result.createdByUserId).toBe(admin.user.userId);
    });

    it('should create treatment plan with authorization', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const serviceCode = await createTestServiceCode(admin.organizationId!);
      const authorization = await createTestAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        organizationId: admin.organizationId!,
      });

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      const result = await createTreatmentPlan(
        {
          patientId: patient.id,
          authorizationId: authorization.id,
          title: 'ABA Treatment Plan',
          description: 'Comprehensive treatment plan',
          startDate: now,
          reviewDate: threeMonthsLater,
        },
        admin.user
      );

      expect(result.authorizationId).toBe(authorization.id);
    });

    it('should allow PRACTITIONER role to create treatment plan', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test123!@#', practitioner.organizationId!);

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      const result = await createTreatmentPlan(
        {
          patientId: patient.id,
          title: 'ABA Treatment Plan',
          description: 'Comprehensive treatment plan',
          startDate: now,
          reviewDate: threeMonthsLater,
        },
        practitioner.user
      );

      expect(result.id).toBeDefined();
    });

    it('should reject PATIENT role', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient('Test123!@#', patientUser.organizationId!);

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      await expect(
        createTreatmentPlan(
          {
            patientId: patient.id,
            title: 'ABA Treatment Plan',
            description: 'Comprehensive treatment plan',
            startDate: now,
            reviewDate: threeMonthsLater,
          },
          patientUser.user
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin2.organizationId!);

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      await expect(
        createTreatmentPlan(
          {
            patientId: patient.id,
            title: 'ABA Treatment Plan',
            description: 'Comprehensive treatment plan',
            startDate: now,
            reviewDate: threeMonthsLater,
          },
          admin1.user
        )
      ).rejects.toThrow('different organization');
    });

    it('should validate dates', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await expect(
        createTreatmentPlan(
          {
            patientId: patient.id,
            title: 'ABA Treatment Plan',
            description: 'Comprehensive treatment plan',
            startDate: now,
            endDate: yesterday,
            reviewDate: now,
          },
          admin.user
        )
      ).rejects.toThrow('End date must be after start date');
    });

    it('should return 404 for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      await expect(
        createTreatmentPlan(
          {
            patientId: 'non-existent-id',
            title: 'ABA Treatment Plan',
            description: 'Comprehensive treatment plan',
            startDate: now,
            reviewDate: threeMonthsLater,
          },
          admin.user
        )
      ).rejects.toThrow('Patient not found');
    });
  });

  describe('getTreatmentPlanById', () => {
    it('should retrieve treatment plan by ID', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const result = await getTreatmentPlanById(treatmentPlan.id, admin.user);

      expect(result.id).toBe(treatmentPlan.id);
      expect(result.title).toBeDefined();
      expect(result.patient).toBeDefined();
      expect(result.goals).toBeDefined();
    });

    it('should allow PRACTITIONER to view treatment plans', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });

      const result = await getTreatmentPlanById(treatmentPlan.id, practitioner.user);

      expect(result.id).toBe(treatmentPlan.id);
    });

    it('should allow PATIENT to view own treatment plan', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient, user: rawUser } = await createCompleteTestPatient(
        'Test123!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const result = await getTreatmentPlanById(treatmentPlan.id, userToJwtPayload(rawUser));

      expect(result.id).toBe(treatmentPlan.id);
    });

    it('should prevent PATIENT from viewing other treatment plans', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { user: patientUser } = await createCompleteTestPatient(
        'Test123!@#',
        admin.organizationId!
      );

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      await expect(getTreatmentPlanById(treatmentPlan.id, userToJwtPayload(patientUser))).rejects.toThrow(
        'Forbidden'
      );
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await expect(getTreatmentPlanById(treatmentPlan.id, admin1.user)).rejects.toThrow(
        'different organization'
      );
    });

    it('should return 404 for non-existent treatment plan', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(getTreatmentPlanById('non-existent-id', admin.user)).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('getAllTreatmentPlans', () => {
    it('should retrieve paginated treatment plans', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await createTestTreatmentPlan({ organizationId: admin.organizationId! });
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });

      const result = await getAllTreatmentPlans(admin.user, { page: 1, limit: 2 });

      expect(result.treatmentPlans).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should filter by patient ID', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });

      const result = await getAllTreatmentPlans(admin.user, { patientId: patient.id });

      expect(result.treatmentPlans.every((tp: any) => tp.patientId === patient.id)).toBe(true);
    });

    it('should filter by status', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.ACTIVE,
      });
      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.DRAFT,
      });

      const result = await getAllTreatmentPlans(admin.user, {
        status: TreatmentPlanStatus.ACTIVE,
      });

      expect(result.treatmentPlans.every((tp: any) => tp.status === 'ACTIVE')).toBe(true);
    });

    it('should return only own treatment plans for PATIENT', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient, user: patientUser } = await createCompleteTestPatient(
        'Test123!@#',
        admin.organizationId!
      );

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });
      await createTestTreatmentPlan({ organizationId: admin.organizationId! });

      const result = await getAllTreatmentPlans(userToJwtPayload(patientUser));

      expect(result.treatmentPlans).toHaveLength(1);
      expect(result.treatmentPlans[0].patientId).toBe(patient.id);
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);

      await createTestTreatmentPlan({ organizationId: admin1.organizationId! });
      await createTestTreatmentPlan({ organizationId: admin2.organizationId! });

      const result = await getAllTreatmentPlans(admin1.user);

      expect(result.treatmentPlans.every((tp: any) => tp.organizationId === admin1.organizationId)).toBe(
        true
      );
    });
  });

  describe('updateTreatmentPlan', () => {
    it('should update treatment plan fields', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const result = await updateTreatmentPlan(
        treatmentPlan.id,
        {
          title: 'Updated Title',
          description: 'Updated description',
        },
        admin.user
      );

      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Updated description');
    });

    it('should allow PRACTITIONER to update treatment plan', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: practitioner.organizationId!,
      });

      const result = await updateTreatmentPlan(
        treatmentPlan.id,
        { title: 'Updated by Practitioner' },
        practitioner.user
      );

      expect(result.title).toBe('Updated by Practitioner');
    });

    it('should reject PATIENT role', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { user: patientUser } = await createCompleteTestPatient(
        'Test123!@#',
        admin.organizationId!
      );
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      await expect(
        updateTreatmentPlan(treatmentPlan.id, { title: 'Updated' }, userToJwtPayload(patientUser))
      ).rejects.toThrow('Forbidden');
    });

    it('should prevent updating completed treatment plans', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.COMPLETED,
      });

      await expect(
        updateTreatmentPlan(treatmentPlan.id, { title: 'Updated' }, admin.user)
      ).rejects.toThrow('Cannot update completed');
    });

    it('should validate date changes', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await expect(
        updateTreatmentPlan(
          treatmentPlan.id,
          {
            startDate: now,
            endDate: yesterday,
          },
          admin.user
        )
      ).rejects.toThrow('End date must be after start date');
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);

      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin2.organizationId!,
      });

      await expect(
        updateTreatmentPlan(treatmentPlan.id, { title: 'Updated' }, admin1.user)
      ).rejects.toThrow('different organization');
    });
  });

  describe('updateTreatmentPlanStatus', () => {
    it('should update status from DRAFT to ACTIVE', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.DRAFT,
      });

      const result = await updateTreatmentPlanStatus(
        treatmentPlan.id,
        TreatmentPlanStatus.ACTIVE,
        admin.user
      );

      expect(result.status).toBe(TreatmentPlanStatus.ACTIVE);
    });

    it('should update status from ACTIVE to COMPLETED', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.ACTIVE,
      });

      const result = await updateTreatmentPlanStatus(
        treatmentPlan.id,
        TreatmentPlanStatus.COMPLETED,
        admin.user
      );

      expect(result.status).toBe(TreatmentPlanStatus.COMPLETED);
    });

    it('should reject invalid status transitions', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        status: TreatmentPlanStatus.COMPLETED,
      });

      await expect(
        updateTreatmentPlanStatus(treatmentPlan.id, TreatmentPlanStatus.DRAFT, admin.user)
      ).rejects.toThrow('Invalid status transition');
    });

    it('should reject PATIENT role', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { user: patientUser } = await createCompleteTestPatient(
        'Test123!@#',
        admin.organizationId!
      );
      const treatmentPlan = await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
      });

      await expect(
        updateTreatmentPlanStatus(treatmentPlan.id, TreatmentPlanStatus.ACTIVE, userToJwtPayload(patientUser))
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getTreatmentPlansByPatient', () => {
    it('should retrieve all treatment plans for a patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });
      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const result = await getTreatmentPlansByPatient(patient.id, admin.user);

      expect(result).toHaveLength(2);
      expect(result.every((tp: any) => tp.patientId === patient.id)).toBe(true);
    });

    it('should allow PATIENT to view own treatment plans', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient, user: patientUser } = await createCompleteTestPatient(
        'Test123!@#',
        admin.organizationId!
      );

      await createTestTreatmentPlan({
        organizationId: admin.organizationId!,
        patientId: patient.id,
      });

      const result = await getTreatmentPlansByPatient(patient.id, userToJwtPayload(patientUser));

      expect(result).toHaveLength(1);
    });

    it('should prevent PATIENT from viewing other patients treatment plans', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin.organizationId!);
      const { user: patientUser2 } = await createCompleteTestPatient(
        'Test456!@#',
        admin.organizationId!
      );

      await expect(getTreatmentPlansByPatient(patient.id, userToJwtPayload(patientUser2))).rejects.toThrow(
        'Forbidden'
      );
    });

    it('should enforce multi-tenancy', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test123!@#', admin2.organizationId!);

      await expect(getTreatmentPlansByPatient(patient.id, admin1.user)).rejects.toThrow(
        'different organization'
      );
    });
  });
});
