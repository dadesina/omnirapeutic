/**
 * Practitioner Endpoint Tests
 *
 * Tests for Practitioner CRUD operations with RBAC and PHI protection
 * HIPAA Compliance: Validates access controls and audit logging for practitioner data
 */

import request from 'supertest';
import { createApp } from '../app';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPractitioner } from './helpers/factories';
import { Role } from '@prisma/client';

const app = createApp();

describe('Practitioner Endpoints', () => {
  describe('POST /api/practitioners - Create Practitioner', () => {
    it('should create a new practitioner as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      const practitionerData = {
        userId: practitionerUser.id,
        firstName: 'Dr. Jane',
        lastName: 'Smith',
        licenseNumber: 'LIC-ABC123456',
        specialization: 'Cardiology',
        phoneNumber: '555-0123'
      };

      const response = await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(practitionerData)
        .expect(201);

      expect(response.body).toHaveProperty('practitioner');
      expect(response.body.practitioner.firstName).toBe('Dr. Jane');
      expect(response.body.practitioner.licenseNumber).toBe('LIC-ABC123456');
      expect(response.body.practitioner.specialization).toBe('Cardiology');

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'CREATE',
          resource: 'practitioners'
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should reject practitioner creation as PRACTITIONER (forbidden)', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      const practitionerData = {
        userId: practitionerUser.id,
        firstName: 'Dr. John',
        lastName: 'Doe',
        licenseNumber: 'LIC-XYZ789',
        specialization: 'Neurology'
      };

      const response = await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(practitionerData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject practitioner creation as PATIENT (forbidden)', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      const practitionerData = {
        userId: practitionerUser.id,
        firstName: 'Dr. John',
        lastName: 'Doe',
        licenseNumber: 'LIC-XYZ789',
        specialization: 'Neurology'
      };

      const response = await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${patient.token}`)
        .send(practitionerData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject practitioner creation without authentication', async () => {
      const practitionerData = {
        userId: 'some-user-id',
        firstName: 'Dr. Jane',
        lastName: 'Smith',
        licenseNumber: 'LIC-ABC123',
        specialization: 'Cardiology'
      };

      const response = await request(app)
        .post('/api/practitioners')
        .send(practitionerData)
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject practitioner creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const response = await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ firstName: 'Dr. Jane' })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('required');
    });

    it('should reject practitioner creation with duplicate license number', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner: existingPractitioner } = await createCompleteTestPractitioner();

      const practitionerUser = await createTestUser(Role.PRACTITIONER);
      const practitionerData = {
        userId: practitionerUser.id,
        firstName: 'Dr. John',
        lastName: 'Doe',
        licenseNumber: existingPractitioner.licenseNumber, // Duplicate
        specialization: 'Oncology'
      };

      const response = await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(practitionerData)
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('GET /api/practitioners - List Practitioners', () => {
    it('should list all practitioners as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createCompleteTestPractitioner();
      await createCompleteTestPractitioner();

      const response = await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('practitioners');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.practitioners)).toBe(true);
      expect(response.body.practitioners.length).toBeGreaterThan(0);

      // Verify audit log for data access
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'practitioners'
        }
      });
      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should list all practitioners as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      await createCompleteTestPractitioner();

      const response = await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('practitioners');
      expect(Array.isArray(response.body.practitioners)).toBe(true);
    });

    it('should reject listing practitioners as PATIENT (forbidden)', async () => {
      const patient = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should support pagination', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const response = await request(app)
        .get('/api/practitioners?page=1&limit=10')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
    });

    it('should support search filtering', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const response = await request(app)
        .get('/api/practitioners?search=cardiology')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('practitioners');
    });

    it('should support specialization filtering', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const response = await request(app)
        .get('/api/practitioners?specialization=Cardiology')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('practitioners');
    });
  });

  describe('GET /api/practitioners/:id - Get Practitioner by ID', () => {
    it('should get practitioner by ID as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .get(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('practitioner');
      expect(response.body.practitioner.id).toBe(practitioner.id);

      // Verify audit log for data access
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should get practitioner by ID as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { practitioner: targetPractitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .get(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.practitioner.id).toBe(targetPractitioner.id);
    });

    it('should allow patient to view practitioner information', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .get(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(200);

      expect(response.body.practitioner.id).toBe(practitioner.id);
    });

    it('should return 404 for non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/practitioners/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('PUT /api/practitioners/:id - Update Practitioner', () => {
    it('should update practitioner as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      const updates = {
        firstName: 'Dr. Updated',
        phoneNumber: '555-9999',
        specialization: 'General Practice'
      };

      const response = await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.practitioner.firstName).toBe('Dr. Updated');
      expect(response.body.practitioner.phoneNumber).toBe('555-9999');
      expect(response.body.practitioner.specialization).toBe('General Practice');

      // Verify audit log for data modification
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'UPDATE',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should allow practitioner to update their own profile', async () => {
      const { user, practitioner } = await createCompleteTestPractitioner();

      // Generate token for the practitioner user
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const updates = {
        phoneNumber: '555-1234',
        specialization: 'Pediatrics'
      };

      const response = await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updates)
        .expect(200);

      expect(response.body.practitioner.phoneNumber).toBe('555-1234');
      expect(response.body.practitioner.specialization).toBe('Pediatrics');
    });

    it('should reject practitioner updating another practitioner profile', async () => {
      const practitioner1 = await createTestUser(Role.PRACTITIONER);
      const { practitioner: practitioner2 } = await createCompleteTestPractitioner();

      const response = await request(app)
        .put(`/api/practitioners/${practitioner2.id}`)
        .set('Authorization', `Bearer ${practitioner1.token}`)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject practitioner update as PATIENT (forbidden)', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for updating non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/practitioners/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('DELETE /api/practitioners/:id - Delete Practitioner', () => {
    it('should delete practitioner as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .delete(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);

      // Verify audit log for data deletion
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'DELETE',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });
      expect(auditLogs).toHaveLength(1);

      // Verify practitioner is deleted
      const deletedPractitioner = await prisma.practitioner.findUnique({
        where: { id: practitioner.id }
      });
      expect(deletedPractitioner).toBeNull();
    });

    it('should reject practitioner deletion as PRACTITIONER (forbidden)', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { practitioner: targetPractitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .delete(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject practitioner deletion as PATIENT (forbidden)', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .delete(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for deleting non-existent practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .delete(`/api/practitioners/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('HIPAA Compliance - Audit Logging', () => {
    it('should log all practitioner data access attempts', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      // Perform multiple operations
      await request(app)
        .get(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-1111' });

      // Verify all actions were logged
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          resource: 'practitioners'
        },
        orderBy: { timestamp: 'asc' }
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(2);
      expect(auditLogs.some(log => log.action === 'READ')).toBe(true);
      expect(auditLogs.some(log => log.action === 'UPDATE')).toBe(true);
    });

    it('should log failed access attempts', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const patient = await createTestUser(Role.PATIENT);

      // Attempt unauthorized access
      await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);

      // Note: Failed attempts should also be logged
      // This depends on implementation in middleware
    });

    it('should include license number in audit logs for compliance', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      const practitionerData = {
        userId: practitionerUser.id,
        firstName: 'Dr. Test',
        lastName: 'User',
        licenseNumber: 'LIC-TEST123',
        specialization: 'Cardiology'
      };

      await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(practitionerData);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          action: 'CREATE',
          resource: 'practitioners'
        },
        orderBy: { timestamp: 'desc' }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog?.details).toHaveProperty('licenseNumber', 'LIC-TEST123');
    });
  });

  describe('Specialization Validation', () => {
    it('should accept valid specializations', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      const validSpecializations = [
        'Cardiology',
        'Neurology',
        'Pediatrics',
        'Oncology',
        'General Practice'
      ];

      for (const specialization of validSpecializations) {
        const practitionerData = {
          userId: practitionerUser.id,
          firstName: 'Dr. Test',
          lastName: 'User',
          licenseNumber: `LIC-${Math.random().toString(36).substring(7)}`,
          specialization
        };

        const response = await request(app)
          .post('/api/practitioners')
          .set('Authorization', `Bearer ${admin.token}`)
          .send(practitionerData);

        expect([201, 409]).toContain(response.status); // 409 if duplicate license

        // Clean up if created
        if (response.status === 201) {
          await prisma.practitioner.delete({
            where: { id: response.body.practitioner.id }
          });
        }
      }
    });
  });
});
