/**
 * Insurance Service Tests
 *
 * Tests for insurance service business logic and edge cases
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import {
  createInsurance,
  getAllInsurance,
  getInsuranceById,
  getInsuranceByPatientId,
  updateInsurance,
  deleteInsurance,
  verifyEligibility
} from '../services/insurance.service';
import { createTestUser } from './helpers/auth.helper';
import { createPatient } from '../services/patient.service';

describe('Insurance Service', () => {
  describe('createInsurance', () => {
    it('should create insurance for patient in same organization', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS001'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Blue Cross',
          memberNumber: 'BC123456',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      expect(insurance).toHaveProperty('id');
      expect(insurance.payerName).toBe('Blue Cross');
      expect(insurance.memberNumber).toBe('BC123456');
      expect(insurance.isActive).toBe(true);
      expect(insurance.organizationId).toBe(admin.organizationId);
    });

    it('should reject creation by non-admin users', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const patientUser = await createTestUser(Role.PATIENT, false, practitioner.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: practitioner.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS002'
        },
        await createTestUser(Role.ADMIN, false, practitioner.organizationId!).then(u => u.user)
      );

      await expect(
        createInsurance(
          {
            patientId: patient.id,
            payerName: 'Aetna',
            memberNumber: 'AET789',
            effectiveDate: new Date('2024-01-01')
          },
          practitioner.user
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should reject creation for patient in different organization', async () => {
      const admin1 = await createTestUser(Role.ADMIN);
      const admin2 = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin2.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin2.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS003'
        },
        admin2.user
      );

      await expect(
        createInsurance(
          {
            patientId: patient.id,
            payerName: 'United',
            memberNumber: 'UHC456',
            effectiveDate: new Date('2024-01-01')
          },
          admin1.user
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should reject creation with invalid date range', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS004'
        },
        admin.user
      );

      await expect(
        createInsurance(
          {
            patientId: patient.id,
            payerName: 'Cigna',
            memberNumber: 'CIG789',
            effectiveDate: new Date('2024-06-01'),
            terminationDate: new Date('2024-01-01')
          },
          admin.user
        )
      ).rejects.toThrow('Termination date must be after effective date');
    });

    it('should deactivate other insurance when creating active insurance', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS005'
        },
        admin.user
      );

      // Create first insurance (active)
      const insurance1 = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Insurance A',
          memberNumber: 'A123',
          effectiveDate: new Date('2024-01-01'),
          isActive: true
        },
        admin.user
      );

      expect(insurance1.isActive).toBe(true);

      // Create second insurance (active) - should deactivate first
      const insurance2 = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Insurance B',
          memberNumber: 'B456',
          effectiveDate: new Date('2024-06-01'),
          isActive: true
        },
        admin.user
      );

      expect(insurance2.isActive).toBe(true);

      // Verify first insurance is now inactive
      const updatedInsurance1 = await prisma.patientInsurance.findUnique({
        where: { id: insurance1.id }
      });
      expect(updatedInsurance1?.isActive).toBe(false);
    });
  });

  describe('getAllInsurance', () => {
    it('should return paginated insurance for admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const result = await getAllInsurance(admin.user, { page: 1, limit: 10 });

      expect(result).toHaveProperty('insurance');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('page', 1);
      expect(result.pagination).toHaveProperty('limit', 10);
    });

    it('should reject access by patient users', async () => {
      const patient = await createTestUser(Role.PATIENT);

      await expect(
        getAllInsurance(patient.user, {})
      ).rejects.toThrow('Forbidden');
    });

    it('should support search filtering', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS006'
        },
        admin.user
      );

      await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Blue Cross Blue Shield',
          memberNumber: 'BCBS123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      const result = await getAllInsurance(admin.user, { search: 'Blue Cross' });
      expect(result.insurance.length).toBeGreaterThan(0);
    });

    it('should filter by isActive status', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS007'
        },
        admin.user
      );

      await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Active Insurance',
          memberNumber: 'ACT123',
          effectiveDate: new Date('2024-01-01'),
          isActive: true
        },
        admin.user
      );

      const result = await getAllInsurance(admin.user, { isActive: true });
      expect(result.insurance.every(ins => ins.isActive)).toBe(true);
    });
  });

  describe('getInsuranceById', () => {
    it('should return insurance by ID for admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS008'
        },
        admin.user
      );

      const created = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Medicare',
          memberNumber: 'MED456',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      const insurance = await getInsuranceById(created.id, admin.user);
      expect(insurance.id).toBe(created.id);
      expect(insurance.payerName).toBe('Medicare');
    });

    it('should throw error for non-existent insurance', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        getInsuranceById('00000000-0000-0000-0000-000000000000', admin.user)
      ).rejects.toThrow('Insurance not found');
    });

    it('should allow patient to view own insurance', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS009'
        },
        admin.user
      );

      const created = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Medicaid',
          memberNumber: 'MCAID789',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      const insurance = await getInsuranceById(created.id, patientUser.user);
      expect(insurance.id).toBe(created.id);
    });

    it('should reject patient viewing another patient insurance', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patient1User = await createTestUser(Role.PATIENT, false, admin.organizationId!);
      const patient2User = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient1 = await createPatient(
        {
          userId: patient1User.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient1',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS010'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient1.id,
          payerName: 'Private Insurance',
          memberNumber: 'PRIV123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      await expect(
        getInsuranceById(insurance.id, patient2User.user)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getInsuranceByPatientId', () => {
    it('should return all insurance for a patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS011'
        },
        admin.user
      );

      await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Insurance 1',
          memberNumber: 'INS1',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Insurance 2',
          memberNumber: 'INS2',
          effectiveDate: new Date('2024-06-01')
        },
        admin.user
      );

      const insurance = await getInsuranceByPatientId(patient.id, admin.user);
      expect(insurance.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw error for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        getInsuranceByPatientId('00000000-0000-0000-0000-000000000000', admin.user)
      ).rejects.toThrow('Patient not found');
    });
  });

  describe('updateInsurance', () => {
    it('should update insurance by admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS012'
        },
        admin.user
      );

      const created = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Original Payer',
          memberNumber: 'ORIG123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      const updated = await updateInsurance(
        created.id,
        { payerName: 'Updated Payer' },
        admin.user
      );

      expect(updated.payerName).toBe('Updated Payer');
      expect(updated.memberNumber).toBe('ORIG123');
    });

    it('should reject update by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS013'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Test Insurance',
          memberNumber: 'TEST123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      await expect(
        updateInsurance(insurance.id, { payerName: 'Hacked' }, practitioner.user)
      ).rejects.toThrow('Forbidden');
    });

    it('should deactivate other insurance when setting isActive to true', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS014'
        },
        admin.user
      );

      const insurance1 = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'First Insurance',
          memberNumber: 'FIRST1',
          effectiveDate: new Date('2024-01-01'),
          isActive: true
        },
        admin.user
      );

      const insurance2 = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Second Insurance',
          memberNumber: 'SECOND2',
          effectiveDate: new Date('2024-06-01'),
          isActive: false
        },
        admin.user
      );

      // Activate second insurance
      await updateInsurance(insurance2.id, { isActive: true }, admin.user);

      // Verify first is now inactive
      const updated1 = await prisma.patientInsurance.findUnique({
        where: { id: insurance1.id }
      });
      expect(updated1?.isActive).toBe(false);
    });
  });

  describe('deleteInsurance', () => {
    it('should delete insurance by admin', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS015'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Delete Me',
          memberNumber: 'DEL123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      await deleteInsurance(insurance.id, admin.user);

      const deleted = await prisma.patientInsurance.findUnique({
        where: { id: insurance.id }
      });
      expect(deleted).toBeNull();
    });

    it('should reject deletion by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS016'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Protected',
          memberNumber: 'PROT123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      await expect(
        deleteInsurance(insurance.id, practitioner.user)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('verifyEligibility', () => {
    it('should update eligibility verification', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS017'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Verify Insurance',
          memberNumber: 'VER123',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      const verification = {
        verifiedBy: 'Test Admin',
        verifiedAt: new Date(),
        coverageActive: true,
        planName: 'Premium Plan',
        copayAmount: 20,
        notes: 'Coverage verified successfully'
      };

      const updated = await verifyEligibility(insurance.id, verification, admin.user);
      expect(updated.lastVerifiedAt).toBeDefined();
      expect(updated.eligibilityVerification).toBeDefined();
    });

    it('should reject verification by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
      const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

      const patient = await createPatient(
        {
          userId: patientUser.id,
          organizationId: admin.organizationId!,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          medicalRecordNumber: 'MRN-INS018'
        },
        admin.user
      );

      const insurance = await createInsurance(
        {
          patientId: patient.id,
          payerName: 'Test Insurance',
          memberNumber: 'TEST456',
          effectiveDate: new Date('2024-01-01')
        },
        admin.user
      );

      const verification = {
        verifiedBy: 'Unauthorized',
        verifiedAt: new Date(),
        coverageActive: true
      };

      await expect(
        verifyEligibility(insurance.id, verification, practitioner.user)
      ).rejects.toThrow('Forbidden');
    });
  });
});
