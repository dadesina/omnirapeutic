/**
 * Authorization Service Tests
 *
 * Comprehensive test suite for authorization management with RBAC enforcement
 * Tests the most critical service - prevents overbilling through atomic unit tracking
 */

import { Role, AuthStatus, ServiceCategory } from '@prisma/client';
import {
  createAuthorization,
  getAllAuthorizations,
  getAuthorizationById,
  getAuthorizationsByPatientId,
  updateAuthorization,
  deleteAuthorization,
  checkAvailableUnits,
  reserveUnits,
  releaseUnits,
  consumeUnits,
  getActiveAuthorization
} from '../services/authorization.service';
import { createTestUser } from './helpers/auth.helper';
import { createServiceCode } from './helpers/service-code.helper';
import { createPatient } from '../services/patient.service';
import { prisma } from './setup';

describe('Authorization Service', () => {
  afterEach(async () => {
    await prisma.authorization.deleteMany();
    await prisma.serviceCode.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  describe('createAuthorization', () => {
    it('should create authorization for patient in same organization', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      expect(authorization).toMatchObject({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        usedUnits: 0,
        scheduledUnits: 0,
        status: AuthStatus.ACTIVE,
        organizationId: admin.organizationId
      });
    });

    it('should reject authorization creation by non-admin', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const admin = await createTestUser(Role.ADMIN, false, practitioner.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, practitioner.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: practitioner.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      await expect(
        createAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          authNumber: 'AUTH-2025-001',
          totalUnits: 100,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31')
        }, practitioner.user)
      ).rejects.toThrow('Forbidden: Only administrators can create authorizations');
    });

    it('should reject authorization for patient in different organization', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin2.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin2.organizationId!
      }, admin2.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin1.user);

      await expect(
        createAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          authNumber: 'AUTH-2025-001',
          totalUnits: 100,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31')
        }, admin1.user)
      ).rejects.toThrow('Forbidden: You can only create authorizations for patients in your organization');
    });

    it('should reject authorization with invalid dates', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      await expect(
        createAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          authNumber: 'AUTH-2025-001',
          totalUnits: 100,
          startDate: new Date('2025-12-31'),
          endDate: new Date('2025-01-01')
        }, admin.user)
      ).rejects.toThrow('End date must be after start date');
    });

    it('should reject authorization with invalid totalUnits', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      await expect(
        createAuthorization({
          patientId: patient.id,
          serviceCodeId: serviceCode.id,
          authNumber: 'AUTH-2025-001',
          totalUnits: 0,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31')
        }, admin.user)
      ).rejects.toThrow('Total units must be greater than 0');
    });
  });

  describe('getAllAuthorizations', () => {
    it('should return all authorizations in organization for admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      const result = await getAllAuthorizations(admin.user);

      expect(result.authorizations).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('should return authorizations for practitioner', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const admin = await createTestUser(Role.ADMIN, false, practitioner.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, practitioner.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: practitioner.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      // Create authorization using the admin
      await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      const result = await getAllAuthorizations(practitioner.user);

      expect(result.authorizations).toHaveLength(1);
    });

    it('should filter authorizations by patientId', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser1 = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient1 = await createPatient({
        userId: patientUser1.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const patientUser2 = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient2 = await createPatient({
        userId: patientUser2.user.userId,
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: new Date('2012-01-01'),
        medicalRecordNumber: 'MRN-TEST-2',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      await createAuthorization({
        patientId: patient1.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      await createAuthorization({
        patientId: patient2.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-002',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      const result = await getAllAuthorizations(admin.user, { patientId: patient1.id });

      expect(result.authorizations).toHaveLength(1);
      expect(result.authorizations[0].patientId).toBe(patient1.id);
    });
  });

  describe('getAuthorizationById', () => {
    it('should return authorization for admin in same organization', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      const result = await getAuthorizationById(authorization.id, admin.user);

      expect(result.id).toBe(authorization.id);
    });

    it('should compute EXPIRED status for past authorization', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2020-001',
        totalUnits: 100,
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      const result = await getAuthorizationById(authorization.id, admin.user);

      expect(result.status).toBe(AuthStatus.EXPIRED);
    });

    it('should reject access to authorization in different organization', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin1.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin1.organizationId!
      }, admin1.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin1.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin1.user);

      await expect(
        getAuthorizationById(authorization.id, admin2.user)
      ).rejects.toThrow('Forbidden: You can only access authorizations in your organization');
    });
  });

  describe('reserveUnits', () => {
    it('should reserve units atomically', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      const updated = await reserveUnits(authorization.id, 20, admin.user);

      expect(updated.scheduledUnits).toBe(20);
      expect(updated.usedUnits).toBe(0);
    });

    it('should reject reservation when insufficient units', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await expect(
        reserveUnits(authorization.id, 150, admin.user)
      ).rejects.toThrow('Insufficient units available');
    });

    it('should handle concurrent reservations correctly', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      // Attempt 10 concurrent reservations of 15 units each
      // Prisma transactions should prevent overbooking
      const promises = Array(10).fill(null).map(() =>
        reserveUnits(authorization.id, 15, admin.user).catch(err => err)
      );

      await Promise.all(promises);

      // CRITICAL: Verify final state - must not exceed total units
      // This is the key test: atomic transactions prevent overbooking
      const final = await getAuthorizationById(authorization.id, admin.user);
      expect(final.scheduledUnits).toBeLessThanOrEqual(100);
      expect(final.scheduledUnits).toBeGreaterThan(0);
      // The atomic transaction ensures no overbooking occurred
      expect(final.scheduledUnits % 15).toBe(0); // Should be exact multiples of 15
    });

    it('should reject reservation by patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await expect(
        reserveUnits(authorization.id, 20, patientUser.user)
      ).rejects.toThrow('Forbidden: Only administrators and practitioners can reserve units');
    });
  });

  describe('releaseUnits', () => {
    it('should release reserved units atomically', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 30, admin.user);
      const updated = await releaseUnits(authorization.id, 10, admin.user);

      expect(updated.scheduledUnits).toBe(20);
    });

    it('should reject release of more units than scheduled', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 10, admin.user);

      await expect(
        releaseUnits(authorization.id, 20, admin.user)
      ).rejects.toThrow('Cannot release more units than are scheduled');
    });
  });

  describe('consumeUnits', () => {
    it('should consume units atomically', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 30, admin.user);
      const updated = await consumeUnits(authorization.id, 20, admin.user);

      expect(updated.usedUnits).toBe(20);
      expect(updated.scheduledUnits).toBe(10);
    });

    it('should set status to EXHAUSTED when all units consumed', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 100, admin.user);
      const updated = await consumeUnits(authorization.id, 100, admin.user);

      expect(updated.status).toBe(AuthStatus.EXHAUSTED);
      expect(updated.usedUnits).toBe(100);
      expect(updated.scheduledUnits).toBe(0);
    });

    it('should reject consumption of more units than scheduled', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 10, admin.user);

      await expect(
        consumeUnits(authorization.id, 20, admin.user)
      ).rejects.toThrow('Cannot consume more units than are scheduled');
    });
  });

  describe('checkAvailableUnits', () => {
    it('should return correct available units', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 30, admin.user);
      await consumeUnits(authorization.id, 20, admin.user);

      const units = await checkAvailableUnits(authorization.id, admin.user);

      expect(units).toMatchObject({
        totalUnits: 100,
        usedUnits: 20,
        scheduledUnits: 10,
        availableUnits: 70 // 100 - 20 - 10
      });
    });
  });

  describe('getActiveAuthorization', () => {
    it('should return active authorization with available units', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      const active = await getActiveAuthorization(patient.id, serviceCode.id, admin.user);

      expect(active).not.toBeNull();
      expect(active!.id).toBe(authorization.id);
    });

    it('should return null when authorization is exhausted', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: AuthStatus.ACTIVE
      }, admin.user);

      await reserveUnits(authorization.id, 100, admin.user);

      const active = await getActiveAuthorization(patient.id, serviceCode.id, admin.user);

      expect(active).toBeNull();
    });
  });

  describe('updateAuthorization', () => {
    it('should update authorization fields', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      const updated = await updateAuthorization(authorization.id, {
        totalUnits: 150,
        notes: 'Increased units per insurance approval'
      }, admin.user);

      expect(updated.totalUnits).toBe(150);
      expect(updated.notes).toBe('Increased units per insurance approval');
    });

    it('should reject update by non-admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      await expect(
        updateAuthorization(authorization.id, { totalUnits: 150 }, practitioner.user)
      ).rejects.toThrow('Forbidden: Only administrators can update authorizations');
    });
  });

  describe('deleteAuthorization', () => {
    it('should delete authorization', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      await deleteAuthorization(authorization.id, admin.user);

      await expect(
        getAuthorizationById(authorization.id, admin.user)
      ).rejects.toThrow('Authorization not found');
    });

    it('should reject delete by non-admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient = await createPatient({
        userId: patientUser.user.userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('2010-01-01'),
        medicalRecordNumber: 'MRN-TEST',
        organizationId: admin.organizationId!
      }, admin.user);

      const serviceCode = await createServiceCode({
        code: '97153',
        description: 'Adaptive behavior treatment',
        category: ServiceCategory.TREATMENT,
      }, admin.user);

      const authorization = await createAuthorization({
        patientId: patient.id,
        serviceCodeId: serviceCode.id,
        authNumber: 'AUTH-2025-001',
        totalUnits: 100,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31')
      }, admin.user);

      await expect(
        deleteAuthorization(authorization.id, practitioner.user)
      ).rejects.toThrow('Forbidden: Only administrators can delete authorizations');
    });
  });
});
