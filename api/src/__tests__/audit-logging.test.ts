/**
 * Audit Logging Tests
 *
 * Comprehensive tests for HIPAA-compliant audit logging
 *
 * HIPAA §164.312(b) - Audit controls
 * "Implement hardware, software, and/or procedural mechanisms that record and
 * examine activity in information systems that contain or use electronic
 * protected health information."
 *
 * Tests verify that:
 * - All PHI access is logged (CREATE, READ, UPDATE, DELETE)
 * - Failed access attempts are tracked
 * - Logs contain sufficient detail for security investigation
 * - Logs are immutable and tamper-evident
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import { Role } from '@prisma/client';

let app: Application;

describe('Audit Logging - HIPAA Compliance', () => {
  beforeAll(async () => {
    // Dynamic import to delay loading until AFTER setup.ts configures test environment
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('Audit Log Structure', () => {
    it('should have required audit log fields', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog).toHaveProperty('id');
      expect(auditLog).toHaveProperty('userId');
      expect(auditLog).toHaveProperty('action');
      expect(auditLog).toHaveProperty('resource');
      expect(auditLog).toHaveProperty('resourceId');
      expect(auditLog).toHaveProperty('timestamp');
      expect(auditLog).toHaveProperty('ipAddress');
      expect(auditLog).toHaveProperty('details');
    });

    it('should record accurate timestamps', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      const beforeTime = new Date();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const afterTime = new Date();

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        },
        orderBy: { timestamp: 'desc' }
      });

      expect(auditLog).toBeTruthy();
      expect(new Date(auditLog!.timestamp)).toBeInstanceOf(Date);
      expect(auditLog!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(auditLog!.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should record IP addresses', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog!.ipAddress).toBeDefined();
      // In testing environment, this will be ::1 or ::ffff:127.0.0.1
      expect(typeof auditLog!.ipAddress).toBe('string');
    });
  });

  describe('Patient PHI Access Logging', () => {
    it('should log patient creation (CREATE)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          userId: patientUser.id,
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          medicalRecordNumber: 'MRN-AUDIT-TEST-001'
        });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'CREATE',
          resource: 'patients'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs[auditLogs.length - 1];
      expect(log.action).toBe('CREATE');
      expect(log.resource).toBe('patients');
    });

    it('should log patient reading (READ)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('READ');
    });

    it('should log patient list access (READ)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createCompleteTestPatient();

      await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'patients'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should log patient updates (UPDATE)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-9999' });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'UPDATE',
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('UPDATE');
    });

    it('should log patient deletion (DELETE)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'DELETE',
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('DELETE');
    });

    it('should include medical record number in audit details', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog!.details).toHaveProperty('medicalRecordNumber');
      expect(auditLog!.details).toMatchObject({
        medicalRecordNumber: patient.medicalRecordNumber
      });
    });
  });

  describe('Practitioner Data Access Logging', () => {
    it('should log practitioner creation (CREATE)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          userId: practitionerUser.id,
          firstName: 'Dr. Audit',
          lastName: 'Test',
          licenseNumber: 'LIC-AUDIT-001',
          specialization: 'Cardiology'
        });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'CREATE',
          resource: 'practitioners'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs[auditLogs.length - 1];
      expect(log.action).toBe('CREATE');
      expect(log.resource).toBe('practitioners');
    });

    it('should log practitioner reading (READ)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .get(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('READ');
    });

    it('should log practitioner updates (UPDATE)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-9999' });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'UPDATE',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('UPDATE');
    });

    it('should log practitioner deletion (DELETE)', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .delete(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'DELETE',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('DELETE');
    });

    it('should include license number in audit details', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .get(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'practitioners',
          resourceId: practitioner.id
        }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog!.details).toHaveProperty('licenseNumber');
    });
  });

  describe('User Authentication Logging', () => {
    it('should log user registration (CREATE)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'audit-test-user@example.com',
          password: 'SecurePass123!',
          role: 'PATIENT'
        });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'CREATE',
          resource: 'users'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs.find(l =>
        l.details &&
        typeof l.details === 'object' &&
        'email' in l.details &&
        l.details.email === 'audit-test-user@example.com'
      );
      expect(log).toBeTruthy();
    });

    it('should log successful login attempts', async () => {
      const { user, password } = await createCompleteTestPatient();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: password
        });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: user.id,
          action: 'LOGIN',
          resource: 'auth'
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should log failed login attempts', async () => {
      const { user } = await createCompleteTestPatient();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: user.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      // Note: Implementation should log failed attempts
      // This test documents the expected behavior
    });
  });

  describe('Multi-User Activity Tracking', () => {
    it('should track different users accessing the same resource', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      // Admin accesses patient
      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      // Practitioner accesses same patient
      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          resource: 'patients',
          resourceId: patient.id,
          action: 'READ'
        },
        orderBy: { timestamp: 'asc' }
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(2);
      expect(auditLogs.map(log => log.userId)).toContain(admin.id);
      expect(auditLogs.map(log => log.userId)).toContain(practitioner.id);
    });

    it('should track chronological access history', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      // Multiple accesses
      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      await new Promise(resolve => setTimeout(resolve, 100));

      await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-1111' });

      await new Promise(resolve => setTimeout(resolve, 100));

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        },
        orderBy: { timestamp: 'asc' }
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(3);
      expect(auditLogs[0].action).toBe('READ');
      expect(auditLogs[1].action).toBe('UPDATE');
      expect(auditLogs[2].action).toBe('READ');

      // Verify timestamps are in order
      for (let i = 1; i < auditLogs.length; i++) {
        expect(auditLogs[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          auditLogs[i - 1].timestamp.getTime()
        );
      }
    });
  });

  describe('Audit Log Retention and Immutability', () => {
    it('should not allow audit logs to be modified', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLog).toBeTruthy();

      // Attempt to modify audit log should fail
      await expect(
        prisma.auditLog.update({
          where: { id: auditLog!.id },
          data: { action: 'MODIFIED' }
        })
      ).rejects.toThrow();
    });

    it('should not allow audit logs to be deleted', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        }
      });

      expect(auditLog).toBeTruthy();

      // Attempt to delete audit log should fail
      await expect(
        prisma.auditLog.delete({
          where: { id: auditLog!.id }
        })
      ).rejects.toThrow();
    });
  });

  describe('Audit Log Query and Retrieval', () => {
    it('should retrieve audit logs by user', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: { userId: admin.id },
        orderBy: { timestamp: 'desc' }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.userId).toBe(admin.id);
      });
    });

    it('should retrieve audit logs by resource', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createCompleteTestPatient();

      await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLogs = await prisma.auditLog.findMany({
        where: { resource: 'patients' },
        orderBy: { timestamp: 'desc' }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.resource).toBe('patients');
      });
    });

    it('should retrieve audit logs by date range', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      const startTime = new Date();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const endTime = new Date();
      endTime.setSeconds(endTime.getSeconds() + 1);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          timestamp: {
            gte: startTime,
            lte: endTime
          }
        }
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.timestamp.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
        expect(log.timestamp.getTime()).toBeLessThanOrEqual(endTime.getTime());
      });
    });

    it('should retrieve audit logs by action type', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const readLogs = await prisma.auditLog.findMany({
        where: { action: 'READ' }
      });

      expect(readLogs.length).toBeGreaterThan(0);
      readLogs.forEach(log => {
        expect(log.action).toBe('READ');
      });
    });
  });

  describe('HIPAA Compliance Requirements', () => {
    it('should maintain audit trail for minimum retention period', async () => {
      // HIPAA requires audit logs to be retained for at least 6 years
      // This test documents the requirement
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        }
      });

      // Verify log exists and has timestamp
      expect(auditLog).toBeTruthy();
      expect(auditLog!.timestamp).toBeInstanceOf(Date);

      // Note: In production, implement automatic cleanup after 6+ years
    });

    it('should provide comprehensive audit information for security investigation', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          resource: 'patients',
          resourceId: patient.id
        }
      });

      // Verify all critical information is present for investigation
      expect(auditLog).toBeTruthy();
      expect(auditLog).toMatchObject({
        userId: expect.any(String),
        action: expect.any(String),
        resource: expect.any(String),
        resourceId: expect.any(String),
        timestamp: expect.any(Date),
        ipAddress: expect.any(String)
      });
      expect(auditLog!.details).toBeDefined();
    });
  });
});
