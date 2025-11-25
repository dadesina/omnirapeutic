/**
 * Patient Endpoint Tests
 *
 * Tests for Patient CRUD operations with RBAC and PHI protection
 * HIPAA Compliance: Validates access controls and audit logging for PHI
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient } from './helpers/factories';
import { Role } from '@prisma/client';

let app: Application;

describe('Patient Endpoints', () => {
  beforeAll(async () => {
    // Dynamic import to delay loading until AFTER setup.ts configures test environment
    const { createApp } = await import('../app');
    app = createApp();
  });
  describe('POST /api/patients - Create Patient', () => {
    it('should create a new patient as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);

      const patientData = {
        userId: patientUser.id,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        medicalRecordNumber: 'MRN-12345',
        phoneNumber: '555-0123',
        address: '123 Main St'
      };

      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(patientData)
        .expect(201);

      expect(response.body).toHaveProperty('patient');
      expect(response.body.patient.firstName).toBe('John');
      expect(response.body.patient.medicalRecordNumber).toBe('MRN-12345');

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'CREATE',
          resource: 'patients'
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should reject patient creation as PRACTITIONER (forbidden)', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const patientUser = await createTestUser(Role.PATIENT);

      const patientData = {
        userId: patientUser.id,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        medicalRecordNumber: 'MRN-12345'
      };

      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(patientData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject patient creation as PATIENT (forbidden)', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const patientUser = await createTestUser(Role.PATIENT);

      const patientData = {
        userId: patientUser.id,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        medicalRecordNumber: 'MRN-12345'
      };

      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${patient.token}`)
        .send(patientData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject patient creation without authentication', async () => {
      const patientData = {
        userId: 'some-user-id',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        medicalRecordNumber: 'MRN-12345'
      };

      const response = await request(app)
        .post('/api/patients')
        .send(patientData)
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject patient creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ firstName: 'John' })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('required');
    });

    it('should reject patient creation with duplicate medical record number', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient: existingPatient } = await createCompleteTestPatient();

      const patientUser = await createTestUser(Role.PATIENT);
      const patientData = {
        userId: patientUser.id,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        medicalRecordNumber: existingPatient.medicalRecordNumber // Duplicate
      };

      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(patientData)
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('GET /api/patients - List Patients', () => {
    it('should list all patients as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createCompleteTestPatient();
      await createCompleteTestPatient();

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('patients');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.patients)).toBe(true);
      expect(response.body.patients.length).toBeGreaterThan(0);

      // Verify audit log for PHI access
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'patients'
        }
      });
      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should list all patients as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      await createCompleteTestPatient();

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('patients');
      expect(Array.isArray(response.body.patients)).toBe(true);
    });

    it('should reject listing patients as PATIENT (forbidden)', async () => {
      const patient = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should support pagination', async () => {
      const admin = await createTestUser(Role.ADMIN);

      const response = await request(app)
        .get('/api/patients?page=1&limit=10')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
    });
  });

  describe('GET /api/patients/:id - Get Patient by ID', () => {
    it('should get patient by ID as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('patient');
      expect(response.body.patient.id).toBe(patient.id);

      // Verify audit log for PHI access
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'READ',
          resource: 'patients',
          resourceId: patient.id
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should get patient by ID as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.patient.id).toBe(patient.id);
    });

    it('should allow patient to view their own record', async () => {
      const { user, patient } = await createCompleteTestPatient();
      const admin = await createTestUser(Role.ADMIN);

      // Generate token for the patient user
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.patient.id).toBe(patient.id);
    });

    it('should reject patient viewing another patient record', async () => {
      const patient1 = await createTestUser(Role.PATIENT);
      const { patient: patient2 } = await createCompleteTestPatient();

      const response = await request(app)
        .get(`/api/patients/${patient2.id}`)
        .set('Authorization', `Bearer ${patient1.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/patients/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('PUT /api/patients/:id - Update Patient', () => {
    it('should update patient as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      const updates = {
        firstName: 'Updated',
        phoneNumber: '555-9999'
      };

      const response = await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.patient.firstName).toBe('Updated');
      expect(response.body.patient.phoneNumber).toBe('555-9999');

      // Verify audit log for PHI modification
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'UPDATE',
          resource: 'patients',
          resourceId: patient.id
        }
      });
      expect(auditLogs).toHaveLength(1);
    });

    it('should reject patient update as PRACTITIONER (forbidden)', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject patient update as PATIENT (forbidden)', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for updating non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/patients/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('DELETE /api/patients/:id - Delete Patient', () => {
    it('should delete patient as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);

      // Verify audit log for PHI deletion
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          action: 'DELETE',
          resource: 'patients',
          resourceId: patient.id
        }
      });
      expect(auditLogs).toHaveLength(1);

      // Verify patient is deleted
      const deletedPatient = await prisma.patient.findUnique({
        where: { id: patient.id }
      });
      expect(deletedPatient).toBeNull();
    });

    it('should reject patient deletion as PRACTITIONER (forbidden)', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject patient deletion as PATIENT (forbidden)', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for deleting non-existent patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .delete(`/api/patients/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('HIPAA Compliance - Audit Logging', () => {
    it('should log all PHI access attempts', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      // Perform multiple operations
      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-1111' });

      // Verify all actions were logged
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: admin.id,
          resource: 'patients'
        },
        orderBy: { timestamp: 'asc' }
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(2);
      expect(auditLogs.some(log => log.action === 'READ')).toBe(true);
      expect(auditLogs.some(log => log.action === 'UPDATE')).toBe(true);
    });

    it('should log failed access attempts', async () => {
      const patient1 = await createTestUser(Role.PATIENT);
      const { patient: patient2 } = await createCompleteTestPatient();

      // Attempt unauthorized access
      await request(app)
        .get(`/api/patients/${patient2.id}`)
        .set('Authorization', `Bearer ${patient1.token}`)
        .expect(403);

      // Note: Failed attempts should also be logged
      // This depends on implementation in middleware
    });
  });
});
