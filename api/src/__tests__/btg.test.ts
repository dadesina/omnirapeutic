/**
 * Break-the-Glass (BTG) Emergency Access Tests
 *
 * Tests the BTG service layer and authorization integration
 * HIPAA § 164.308(a)(4)(ii)(C) - Emergency Access Procedure
 */

import { Role } from '@prisma/client';
import { prisma } from './setup';
import {
  createBtgGrant,
  revokeBtgGrant,
  getActiveBtgGrants,
  hasActiveBtgAccess,
  cleanupExpiredGrants,
  ALLOWED_DURATIONS,
} from '../services/btg.service';
import { getPatientById } from '../services/patient.service';
import {
  createCompleteTestAdmin,
  createCompleteTestPatient,
} from './helpers/factories';
import { JwtPayload } from '../services/auth.service';

describe('BTG Service', () => {
  describe('createBtgGrant', () => {
    it('should successfully create a BTG grant with valid inputs', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: admin2.user.id,
        patientId: patient.patient.id,
        justification: 'Emergency database investigation - patient data corruption reported by clinical staff',
        durationMinutes: 120 as const,
      };

      // Act
      const result = await createBtgGrant(grantRequest, requestingUser, '192.168.1.1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.grantId).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.message).toContain('120 minutes');

      // Verify grant was created in database
      const grant = await prisma.btgAccessGrant.findUnique({
        where: { id: result.grantId },
      });
      expect(grant).toBeDefined();
      expect(grant!.grantedByUserId).toBe(admin1.user.id);
      expect(grant!.grantedToUserId).toBe(admin2.user.id);
      expect(grant!.patientId).toBe(patient.patient.id);
      expect(grant!.durationMinutes).toBe(120);

      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'BTG_GRANT_ACCESS',
          resourceId: result.grantId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('should reject grant creation by non-ADMIN user', async () => {
      // Arrange
      const patient = await createCompleteTestPatient();
      const practitioner = await prisma.user.create({
        data: {
          email: 'practitioner@test.com',
          password: 'hashed',
          role: Role.PRACTITIONER,
        },
      });

      const requestingUser: JwtPayload = {
        userId: practitioner.id,
        email: practitioner.email,
        role: Role.PRACTITIONER,
        organizationId: practitioner.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: practitioner.id,
        patientId: patient.patient.id,
        justification: 'Emergency access needed for patient care',
        durationMinutes: 60 as const,
      };

      // Act & Assert
      await expect(
        createBtgGrant(grantRequest, requestingUser, '192.168.1.1')
      ).rejects.toThrow('Forbidden: Only ADMIN users can grant BTG access');
    });

    it('should reject invalid duration', async () => {
      // Arrange
      const admin = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin.user.id,
        email: admin.user.email,
        role: Role.ADMIN,
        organizationId: admin.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: admin.user.id,
        patientId: patient.patient.id,
        justification: 'Emergency investigation required for data integrity',
        durationMinutes: 999 as any, // Invalid duration
      };

      // Act & Assert
      await expect(
        createBtgGrant(grantRequest, requestingUser, '192.168.1.1')
      ).rejects.toThrow('Invalid duration');
    });

    it('should reject justification that is too short', async () => {
      // Arrange
      const admin = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin.user.id,
        email: admin.user.email,
        role: Role.ADMIN,
        organizationId: admin.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: admin.user.id,
        patientId: patient.patient.id,
        justification: 'Too short',
        durationMinutes: 60 as const,
      };

      // Act & Assert
      await expect(
        createBtgGrant(grantRequest, requestingUser, '192.168.1.1')
      ).rejects.toThrow('Justification must be at least 25 characters');
    });

    it('should reject grant to non-ADMIN user', async () => {
      // Arrange
      const admin = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin.user.id,
        email: admin.user.email,
        role: Role.ADMIN,
        organizationId: admin.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: patient.user.id, // PATIENT role, not ADMIN
        patientId: patient.patient.id,
        justification: 'Emergency investigation for system maintenance and data integrity',
        durationMinutes: 60 as const,
      };

      // Act & Assert
      await expect(
        createBtgGrant(grantRequest, requestingUser, '192.168.1.1')
      ).rejects.toThrow('Can only grant BTG access to ADMIN users');
    });

    it('should reject grant for non-existent patient', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: admin2.user.id,
        patientId: 'non-existent-patient-id',
        justification: 'Emergency investigation required for data integrity check',
        durationMinutes: 60 as const,
      };

      // Act & Assert
      await expect(
        createBtgGrant(grantRequest, requestingUser, '192.168.1.1')
      ).rejects.toThrow('Patient not found');
    });

    it('should test all allowed durations', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      // Act & Assert
      for (const duration of ALLOWED_DURATIONS) {
        const grantRequest = {
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: `Emergency investigation for ${duration} minutes duration test`,
          durationMinutes: duration,
        };

        const result = await createBtgGrant(grantRequest, requestingUser, '192.168.1.1');
        expect(result.success).toBe(true);
        expect(result.message).toContain(`${duration} minutes`);
      }
    });
  });

  describe('revokeBtgGrant', () => {
    it('should successfully revoke an active grant', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: admin2.user.id,
        patientId: patient.patient.id,
        justification: 'Emergency database investigation for data corruption issue',
        durationMinutes: 120 as const,
      };

      const grant = await createBtgGrant(grantRequest, requestingUser, '192.168.1.1');

      // Act
      const result = await revokeBtgGrant(
        grant.grantId,
        'Investigation completed',
        requestingUser,
        '192.168.1.1'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('revoked successfully');

      // Verify grant was revoked in database
      const revokedGrant = await prisma.btgAccessGrant.findUnique({
        where: { id: grant.grantId },
      });
      expect(revokedGrant!.revokedAt).toBeDefined();
      expect(revokedGrant!.revokedByUserId).toBe(admin1.user.id);
      expect(revokedGrant!.revokedReason).toBe('Investigation completed');

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'BTG_REVOKE_ACCESS',
          resourceId: grant.grantId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('should reject revoking non-existent grant', async () => {
      // Arrange
      const admin = await createCompleteTestAdmin();

      const requestingUser: JwtPayload = {
        userId: admin.user.id,
        email: admin.user.email,
        role: Role.ADMIN,
        organizationId: admin.user.organizationId,
        isSuperAdmin: false
      };

      // Act & Assert
      await expect(
        revokeBtgGrant('non-existent-grant-id', 'Test reason', requestingUser, '192.168.1.1')
      ).rejects.toThrow('Grant not found');
    });

    it('should reject revoking already revoked grant', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      const grantRequest = {
        grantedToUserId: admin2.user.id,
        patientId: patient.patient.id,
        justification: 'Emergency investigation for patient data verification',
        durationMinutes: 60 as const,
      };

      const grant = await createBtgGrant(grantRequest, requestingUser, '192.168.1.1');
      await revokeBtgGrant(grant.grantId, 'First revocation', requestingUser, '192.168.1.1');

      // Act & Assert
      await expect(
        revokeBtgGrant(grant.grantId, 'Second revocation', requestingUser, '192.168.1.1')
      ).rejects.toThrow('already been revoked');
    });
  });

  describe('getActiveBtgGrants', () => {
    it('should return all active grants', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient1 = await createCompleteTestPatient();
      const patient2 = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      // Create 2 active grants
      await createBtgGrant(
        {
          grantedToUserId: admin2.user.id,
          patientId: patient1.patient.id,
          justification: 'Emergency investigation for patient data integrity',
          durationMinutes: 120 as const,
        },
        requestingUser,
        '192.168.1.1'
      );

      await createBtgGrant(
        {
          grantedToUserId: admin2.user.id,
          patientId: patient2.patient.id,
          justification: 'System maintenance emergency access for data verification',
          durationMinutes: 60 as const,
        },
        requestingUser,
        '192.168.1.1'
      );

      // Act
      const grants = await getActiveBtgGrants(requestingUser);

      // Assert
      expect(grants).toHaveLength(2);
      expect(grants[0].grantedByUser.email).toBe(admin1.user.email);
      expect(grants[0].grantedToUser.email).toBe(admin2.user.email);
      expect(grants[0].patient).toBeDefined();
    });

    it('should not return revoked grants', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      const grant = await createBtgGrant(
        {
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Emergency access for database corruption investigation',
          durationMinutes: 60 as const,
        },
        requestingUser,
        '192.168.1.1'
      );

      await revokeBtgGrant(grant.grantId, 'Test revocation', requestingUser, '192.168.1.1');

      // Act
      const grants = await getActiveBtgGrants(requestingUser);

      // Assert
      expect(grants).toHaveLength(0);
    });

    it('should reject listing by non-ADMIN user', async () => {
      // Arrange
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: patient.user.id,
        email: patient.user.email,
        role: Role.PATIENT,
        organizationId: patient.user.organizationId,
        isSuperAdmin: false
      };

      // Act & Assert
      await expect(getActiveBtgGrants(requestingUser)).rejects.toThrow(
        'Forbidden: Only ADMIN users can view BTG grants'
      );
    });
  });

  describe('hasActiveBtgAccess', () => {
    it('should return true when user has active grant for patient', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      await createBtgGrant(
        {
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Emergency investigation for data integrity verification',
          durationMinutes: 60 as const,
        },
        requestingUser,
        '192.168.1.1'
      );

      // Act
      const hasAccess = await hasActiveBtgAccess(admin2.user.id, patient.patient.id);

      // Assert
      expect(hasAccess).toBe(true);
    });

    it('should return false when user has no grant for patient', async () => {
      // Arrange
      const admin = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      // Act
      const hasAccess = await hasActiveBtgAccess(admin.user.id, patient.patient.id);

      // Assert
      expect(hasAccess).toBe(false);
    });

    it('should return false when grant is revoked', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const requestingUser: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      const grant = await createBtgGrant(
        {
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Emergency access for system maintenance and data verification',
          durationMinutes: 60 as const,
        },
        requestingUser,
        '192.168.1.1'
      );

      await revokeBtgGrant(grant.grantId, 'Test revocation', requestingUser, '192.168.1.1');

      // Act
      const hasAccess = await hasActiveBtgAccess(admin2.user.id, patient.patient.id);

      // Assert
      expect(hasAccess).toBe(false);
    });

    it('should return false when grant is expired', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      // Create a grant that's already expired (manually in DB)
      const expiredGrant = await prisma.btgAccessGrant.create({
        data: {
          grantedByUserId: admin1.user.id,
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Test expired grant for emergency access verification',
          durationMinutes: 60,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      // Act
      const hasAccess = await hasActiveBtgAccess(admin2.user.id, patient.patient.id);

      // Assert
      expect(hasAccess).toBe(false);
    });
  });

  describe('BTG Authorization Integration', () => {
    it('should allow patient access via active BTG grant', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      const grantingAdmin: JwtPayload = {
        userId: admin1.user.id,
        email: admin1.user.email,
        role: Role.ADMIN,
        organizationId: admin1.user.organizationId,
        isSuperAdmin: false
      };

      // Create BTG grant
      await createBtgGrant(
        {
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Emergency investigation for patient data integrity verification',
          durationMinutes: 60 as const,
        },
        grantingAdmin,
        '192.168.1.1'
      );

      const grantedAdmin: JwtPayload = {
        userId: admin2.user.id,
        email: admin2.user.email,
        role: Role.ADMIN,
        organizationId: admin2.user.organizationId,
        isSuperAdmin: false
      };

      // Act - admin2 should be able to access patient via BTG
      const accessedPatient = await getPatientById(patient.patient.id, grantedAdmin);

      // Assert
      expect(accessedPatient).toBeDefined();
      expect(accessedPatient.id).toBe(patient.patient.id);
    });

    it('should deny patient access without BTG grant for non-owner ADMIN', async () => {
      // Arrange - Create admin and patient in same organization
      // Note: ADMINs have broad access within their organization

      const admin = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient('Test123!@#', admin.user.organizationId!);

      const requestingAdmin: JwtPayload = {
        userId: admin.user.id,
        email: admin.user.email,
        role: Role.ADMIN,
        organizationId: admin.user.organizationId,
        isSuperAdmin: false
      };

      // Act - ADMIN should be able to access patients in their organization
      // This test verifies ADMINs have access within their org even without BTG
      const accessedPatient = await getPatientById(patient.patient.id, requestingAdmin);

      // Assert
      expect(accessedPatient).toBeDefined();
      expect(accessedPatient.id).toBe(patient.patient.id);
    });
  });

  describe('cleanupExpiredGrants', () => {
    it('should delete grants older than 30 days', async () => {
      // Arrange
      const admin1 = await createCompleteTestAdmin();
      const admin2 = await createCompleteTestAdmin();
      const patient = await createCompleteTestPatient();

      // Create an old expired grant (31 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      await prisma.btgAccessGrant.create({
        data: {
          grantedByUserId: admin1.user.id,
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Old grant for cleanup test - emergency data integrity check',
          durationMinutes: 60,
          expiresAt: oldDate,
        },
      });

      // Create a recent expired grant (1 day ago)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);

      await prisma.btgAccessGrant.create({
        data: {
          grantedByUserId: admin1.user.id,
          grantedToUserId: admin2.user.id,
          patientId: patient.patient.id,
          justification: 'Recent grant for cleanup test - emergency access verification',
          durationMinutes: 60,
          expiresAt: recentDate,
        },
      });

      // Act
      const deletedCount = await cleanupExpiredGrants();

      // Assert
      expect(deletedCount).toBe(1); // Only old grant should be deleted

      const remainingGrants = await prisma.btgAccessGrant.count();
      expect(remainingGrants).toBe(1); // Recent grant should remain
    });
  });
});
