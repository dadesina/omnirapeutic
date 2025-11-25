/**
 * Patient Service Tests
 *
 * Tests for patient service business logic and edge cases
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import {
  createPatient,
  getAllPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  getPatientByUserId
} from '../services/patient.service';
import { createTestUser } from './helpers/auth.helper';

describe('Patient Service', () => {
  describe('createPatient', () => {
    it('should reject creation with future date of birth', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const user = await createTestUser(Role.PATIENT);

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await expect(
        createPatient(
          {
            userId: user.id,
            firstName: 'Test',
            lastName: 'Patient',
            dateOfBirth: futureDate,
            medicalRecordNumber: 'MRN-FUTURE123'
          },
          admin.user
        )
      ).rejects.toThrow('Date of birth must be in the past');
    });

    it('should reject creation by non-admin users', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const user = await createTestUser(Role.PATIENT);

      await expect(
        createPatient(
          {
            userId: user.id,
            firstName: 'Test',
            lastName: 'Patient',
            dateOfBirth: new Date('1990-01-01'),
            medicalRecordNumber: 'MRN-TEST123'
          },
          practitioner.user
        )
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getAllPatients', () => {
    it('should reject access by patient users', async () => {
      const patient = await createTestUser(Role.PATIENT);

      await expect(
        getAllPatients(patient.user, {})
      ).rejects.toThrow('Forbidden');
    });

    it('should support search filtering', async () => {
      const admin = await createTestUser(Role.ADMIN);

      // Create test patients
      const user1 = await createTestUser(Role.PATIENT);
      const user2 = await createTestUser(Role.PATIENT);

      await createPatient(
        {
          userId: user1.id,
          firstName: 'John',
          lastName: 'Smith',
          dateOfBirth: new Date('1980-01-01'),
          medicalRecordNumber: 'MRN-JOHN123'
        },
        admin.user
      );

      await createPatient(
        {
          userId: user2.id,
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: new Date('1985-01-01'),
          medicalRecordNumber: 'MRN-JANE456'
        },
        admin.user
      );

      const result = await getAllPatients(admin.user, { search: 'John' });

      expect(result.patients.length).toBeGreaterThan(0);
      expect(result.pagination.total).toBeGreaterThan(0);
    });
  });

  describe('getPatientById', () => {
    it('should throw error for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        getPatientById('00000000-0000-0000-0000-000000000000', admin.user)
      ).rejects.toThrow('Patient not found');
    });

    it('should reject access when patient views another patient record', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patient1 = await createTestUser(Role.PATIENT);
      const patient2 = await createTestUser(Role.PATIENT);

      const createdPatient = await createPatient(
        {
          userId: patient1.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-TEST789'
        },
        admin.user
      );

      await expect(
        getPatientById(createdPatient.id, patient2.user)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('updatePatient', () => {
    it('should throw error for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        updatePatient(
          '00000000-0000-0000-0000-000000000000',
          { firstName: 'Updated' },
          admin.user
        )
      ).rejects.toThrow('Patient not found');
    });

    it('should reject update with future date of birth', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const user = await createTestUser(Role.PATIENT);

      const patient = await createPatient(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-UPDATE123'
        },
        admin.user
      );

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await expect(
        updatePatient(
          patient.id,
          { dateOfBirth: futureDate },
          admin.user
        )
      ).rejects.toThrow('Date of birth must be in the past');
    });

    it('should reject update by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const user = await createTestUser(Role.PATIENT);

      const patient = await createPatient(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-NOUPDATE'
        },
        admin.user
      );

      await expect(
        updatePatient(
          patient.id,
          { firstName: 'Updated' },
          practitioner.user
        )
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('deletePatient', () => {
    it('should throw error for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        deletePatient('00000000-0000-0000-0000-000000000000', admin.user)
      ).rejects.toThrow('Patient not found');
    });

    it('should reject deletion by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const user = await createTestUser(Role.PATIENT);

      const patient = await createPatient(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-NODELETE'
        },
        admin.user
      );

      await expect(
        deletePatient(patient.id, practitioner.user)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getPatientByUserId', () => {
    it('should return null for non-existent user', async () => {
      const result = await getPatientByUserId('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('should return patient when exists', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const user = await createTestUser(Role.PATIENT);

      await createPatient(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-BYUSER123'
        },
        admin.user
      );

      const result = await getPatientByUserId(user.id);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
    });
  });
});
