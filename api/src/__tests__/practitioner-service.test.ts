/**
 * Practitioner Service Tests
 *
 * Tests for practitioner service business logic and edge cases
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import {
  createPractitioner,
  getAllPractitioners,
  getPractitionerById,
  updatePractitioner,
  deletePractitioner,
  getPractitionerByUserId
} from '../services/practitioner.service';
import { createTestUser } from './helpers/auth.helper';

describe('Practitioner Service', () => {
  describe('createPractitioner', () => {
    it('should reject creation by non-admin users', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const user = await createTestUser(Role.PRACTITIONER);

      await expect(
        createPractitioner(
          {
            userId: user.id,
            firstName: 'Test',
            lastName: 'Doctor',
            licenseNumber: 'LIC-TEST123',
            specialization: 'General Practice'
          },
          practitioner.user
        )
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getAllPractitioners', () => {
    it('should support search filtering', async () => {
      const admin = await createTestUser(Role.ADMIN);

      // Create test practitioners
      const user1 = await createTestUser(Role.PRACTITIONER);
      const user2 = await createTestUser(Role.PRACTITIONER);

      await createPractitioner(
        {
          userId: user1.id,
          firstName: 'John',
          lastName: 'Smith',
          licenseNumber: 'LIC-JOHN123',
          specialization: 'Cardiology'
        },
        admin.user
      );

      await createPractitioner(
        {
          userId: user2.id,
          firstName: 'Jane',
          lastName: 'Doe',
          licenseNumber: 'LIC-JANE456',
          specialization: 'Pediatrics'
        },
        admin.user
      );

      const result = await getAllPractitioners(admin.user, { search: 'John' });

      expect(result.practitioners.length).toBeGreaterThan(0);
      expect(result.pagination.total).toBeGreaterThan(0);
    });

    it('should return paginated results', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const result = await getAllPractitioners(admin.user, { page: 1, limit: 10 });

      expect(result).toHaveProperty('practitioners');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('page', 1);
      expect(result.pagination).toHaveProperty('limit', 10);
      expect(result.pagination).toHaveProperty('totalPages');
    });
  });

  describe('getPractitionerById', () => {
    it('should throw error for non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await expect(
        getPractitionerById('00000000-0000-0000-0000-000000000000', admin.user)
      ).rejects.toThrow('Practitioner not found');
    });
  });

  describe('updatePractitioner', () => {
    it('should throw error for non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        updatePractitioner(
          '00000000-0000-0000-0000-000000000000',
          { firstName: 'Updated' },
          admin.user
        )
      ).rejects.toThrow('Practitioner not found');
    });

    it('should reject update by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const user = await createTestUser(Role.PRACTITIONER);

      const created = await createPractitioner(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Doctor',
          licenseNumber: 'LIC-NOUPDATE',
          specialization: 'General Practice'
        },
        admin.user
      );

      await expect(
        updatePractitioner(
          created.id,
          { firstName: 'Updated' },
          practitioner.user
        )
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('deletePractitioner', () => {
    it('should throw error for non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);

      await expect(
        deletePractitioner('00000000-0000-0000-0000-000000000000', admin.user)
      ).rejects.toThrow('Practitioner not found');
    });

    it('should reject deletion by non-admin users', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const user = await createTestUser(Role.PRACTITIONER);

      const created = await createPractitioner(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Doctor',
          licenseNumber: 'LIC-NODELETE',
          specialization: 'General Practice'
        },
        admin.user
      );

      await expect(
        deletePractitioner(created.id, practitioner.user)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getPractitionerByUserId', () => {
    it('should return null for non-existent user', async () => {
      const result = await getPractitionerByUserId('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('should return practitioner when exists', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const user = await createTestUser(Role.PRACTITIONER);

      await createPractitioner(
        {
          userId: user.id,
          firstName: 'Test',
          lastName: 'Doctor',
          licenseNumber: 'LIC-BYUSER123',
          specialization: 'General Practice'
        },
        admin.user
      );

      const result = await getPractitionerByUserId(user.id);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
    });
  });
});
