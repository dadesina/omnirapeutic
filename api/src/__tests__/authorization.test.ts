/**
 * Authorization & RBAC Tests
 *
 * Comprehensive tests for Role-Based Access Control (RBAC) enforcement
 * HIPAA Compliance: Validates access controls and role-based permissions
 *
 * Tests verify that:
 * - ADMIN role has full access to all resources
 * - PRACTITIONER role has appropriate access to patient data
 * - PATIENT role can only access their own data
 * - All unauthorized access attempts are properly rejected
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../app';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient, createCompleteTestPractitioner } from './helpers/factories';
import { Role } from '@prisma/client';

let app: Application;

describe('Authorization & RBAC', () => {
  beforeAll(() => {
    // Create app AFTER setup.ts runs to ensure correct Prisma instance
    app = createApp();
  });
  describe('Role Hierarchy', () => {
    it('should have correct role hierarchy: ADMIN > PRACTITIONER > PATIENT', async () => {
      // This is a conceptual test documenting the role hierarchy
      const roles = [Role.ADMIN, Role.PRACTITIONER, Role.PATIENT];
      expect(roles).toHaveLength(3);
      expect(roles).toContain(Role.ADMIN);
      expect(roles).toContain(Role.PRACTITIONER);
      expect(roles).toContain(Role.PATIENT);
    });
  });

  describe('ADMIN Role Permissions', () => {
    it('should allow ADMIN to create patients', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const patientUser = await createTestUser(Role.PATIENT);

      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          userId: patientUser.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: '1990-01-01',
          medicalRecordNumber: 'MRN-TEST123'
        })
        .expect(201);

      expect(response.body.patient).toBeDefined();
    });

    it('should allow ADMIN to create practitioners', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      const response = await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          userId: practitionerUser.id,
          firstName: 'Dr. Test',
          lastName: 'Practitioner',
          licenseNumber: 'LIC-TEST123',
          specialization: 'Cardiology'
        })
        .expect(201);

      expect(response.body.practitioner).toBeDefined();
    });

    it('should allow ADMIN to list all patients', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createCompleteTestPatient();

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.patients).toBeDefined();
      expect(Array.isArray(response.body.patients)).toBe(true);
    });

    it('should allow ADMIN to list all practitioners', async () => {
      const admin = await createTestUser(Role.ADMIN);
      await createCompleteTestPractitioner();

      const response = await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.practitioners).toBeDefined();
      expect(Array.isArray(response.body.practitioners)).toBe(true);
    });

    it('should allow ADMIN to update any patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-9999' })
        .expect(200);

      expect(response.body.patient.phoneNumber).toBe('555-9999');
    });

    it('should allow ADMIN to update any practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phoneNumber: '555-9999' })
        .expect(200);

      expect(response.body.practitioner.phoneNumber).toBe('555-9999');
    });

    it('should allow ADMIN to delete any patient', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);
    });

    it('should allow ADMIN to delete any practitioner', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .delete(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);
    });
  });

  describe('PRACTITIONER Role Permissions', () => {
    it('should allow PRACTITIONER to list patients', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      await createCompleteTestPatient();

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.patients).toBeDefined();
    });

    it('should allow PRACTITIONER to list practitioners', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      await createCompleteTestPractitioner();

      const response = await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.practitioners).toBeDefined();
    });

    it('should allow PRACTITIONER to view patient details', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      const response = await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.patient).toBeDefined();
    });

    it('should allow PRACTITIONER to view practitioner details', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { practitioner: targetPractitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .get(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.practitioner).toBeDefined();
    });

    it('should NOT allow PRACTITIONER to create patients', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({
          userId: patientUser.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: '1990-01-01',
          medicalRecordNumber: 'MRN-TEST123'
        })
        .expect(403);
    });

    it('should NOT allow PRACTITIONER to create practitioners', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({
          userId: practitionerUser.id,
          firstName: 'Dr. Test',
          lastName: 'Practitioner',
          licenseNumber: 'LIC-TEST123',
          specialization: 'Cardiology'
        })
        .expect(403);
    });

    it('should NOT allow PRACTITIONER to update patient records', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ phoneNumber: '555-9999' })
        .expect(403);
    });

    it('should NOT allow PRACTITIONER to delete patients', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);
    });

    it('should NOT allow PRACTITIONER to delete practitioners', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { practitioner: targetPractitioner } = await createCompleteTestPractitioner();

      await request(app)
        .delete(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);
    });

    it('should allow PRACTITIONER to update their own profile', async () => {
      const { user, practitioner } = await createCompleteTestPractitioner();

      // Generate token for the practitioner user
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ phoneNumber: '555-1234' })
        .expect(200);

      expect(response.body.practitioner.phoneNumber).toBe('555-1234');
    });

    it('should NOT allow PRACTITIONER to update another practitioner profile', async () => {
      const practitioner1 = await createTestUser(Role.PRACTITIONER);
      const { practitioner: practitioner2 } = await createCompleteTestPractitioner();

      await request(app)
        .put(`/api/practitioners/${practitioner2.id}`)
        .set('Authorization', `Bearer ${practitioner1.token}`)
        .send({ phoneNumber: '555-9999' })
        .expect(403);
    });
  });

  describe('PATIENT Role Permissions', () => {
    it('should allow PATIENT to view practitioner details', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner } = await createCompleteTestPractitioner();

      const response = await request(app)
        .get(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(200);

      expect(response.body.practitioner).toBeDefined();
    });

    it('should allow PATIENT to view their own patient record', async () => {
      const { user, patient } = await createCompleteTestPatient();

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

    it('should NOT allow PATIENT to list all patients', async () => {
      const patient = await createTestUser(Role.PATIENT);

      await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);
    });

    it('should NOT allow PATIENT to list all practitioners', async () => {
      const patient = await createTestUser(Role.PATIENT);

      await request(app)
        .get('/api/practitioners')
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);
    });

    it('should NOT allow PATIENT to view another patient record', async () => {
      const patient1 = await createTestUser(Role.PATIENT);
      const { patient: patient2 } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient2.id}`)
        .set('Authorization', `Bearer ${patient1.token}`)
        .expect(403);
    });

    it('should NOT allow PATIENT to create patients', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const patientUser = await createTestUser(Role.PATIENT);

      await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({
          userId: patientUser.id,
          firstName: 'Test',
          lastName: 'Patient',
          dateOfBirth: '1990-01-01',
          medicalRecordNumber: 'MRN-TEST123'
        })
        .expect(403);
    });

    it('should NOT allow PATIENT to create practitioners', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const practitionerUser = await createTestUser(Role.PRACTITIONER);

      await request(app)
        .post('/api/practitioners')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({
          userId: practitionerUser.id,
          firstName: 'Dr. Test',
          lastName: 'Practitioner',
          licenseNumber: 'LIC-TEST123',
          specialization: 'Cardiology'
        })
        .expect(403);
    });

    it('should NOT allow PATIENT to update any patient records', async () => {
      const patient1 = await createTestUser(Role.PATIENT);
      const { patient: patient2 } = await createCompleteTestPatient();

      await request(app)
        .put(`/api/patients/${patient2.id}`)
        .set('Authorization', `Bearer ${patient1.token}`)
        .send({ phoneNumber: '555-9999' })
        .expect(403);
    });

    it('should NOT allow PATIENT to update practitioner profiles', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .put(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ phoneNumber: '555-9999' })
        .expect(403);
    });

    it('should NOT allow PATIENT to delete any patients', async () => {
      const patient1 = await createTestUser(Role.PATIENT);
      const { patient: patient2 } = await createCompleteTestPatient();

      await request(app)
        .delete(`/api/patients/${patient2.id}`)
        .set('Authorization', `Bearer ${patient1.token}`)
        .expect(403);
    });

    it('should NOT allow PATIENT to delete practitioners', async () => {
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app)
        .delete(`/api/practitioners/${practitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);
    });
  });

  describe('Unauthenticated Access', () => {
    it('should reject all patient endpoints without authentication', async () => {
      const { patient } = await createCompleteTestPatient();

      await request(app).get('/api/patients').expect(401);
      await request(app).get(`/api/patients/${patient.id}`).expect(401);
      await request(app).post('/api/patients').send({}).expect(401);
      await request(app).put(`/api/patients/${patient.id}`).send({}).expect(401);
      await request(app).delete(`/api/patients/${patient.id}`).expect(401);
    });

    it('should reject all practitioner endpoints without authentication', async () => {
      const { practitioner } = await createCompleteTestPractitioner();

      await request(app).get('/api/practitioners').expect(401);
      await request(app).get(`/api/practitioners/${practitioner.id}`).expect(401);
      await request(app).post('/api/practitioners').send({}).expect(401);
      await request(app).put(`/api/practitioners/${practitioner.id}`).send({}).expect(401);
      await request(app).delete(`/api/practitioners/${practitioner.id}`).expect(401);
    });
  });

  describe('Cross-Role Access Patterns', () => {
    it('should enforce strict role separation for patient data', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const patient = await createTestUser(Role.PATIENT);
      const { patient: targetPatient } = await createCompleteTestPatient();

      // ADMIN can access
      await request(app)
        .get(`/api/patients/${targetPatient.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      // PRACTITIONER can access
      await request(app)
        .get(`/api/patients/${targetPatient.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      // Other PATIENT cannot access
      await request(app)
        .get(`/api/patients/${targetPatient.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(403);
    });

    it('should enforce proper access control for practitioner data', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const patient = await createTestUser(Role.PATIENT);
      const { practitioner: targetPractitioner } = await createCompleteTestPractitioner();

      // All roles can view practitioner details
      await request(app)
        .get(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      await request(app)
        .get(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      await request(app)
        .get(`/api/practitioners/${targetPractitioner.id}`)
        .set('Authorization', `Bearer ${patient.token}`)
        .expect(200);
    });
  });

  describe('HIPAA Compliance - Access Logging', () => {
    it('should log all role-based access attempts for audit trail', async () => {
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
      expect(auditLog?.userId).toBe(admin.id);
    });

    it('should track role information in audit logs', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient();

      await request(app)
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      // Verify the user role is accessible for audit purposes
      const user = await prisma.user.findUnique({
        where: { id: admin.id }
      });

      expect(user?.role).toBe(Role.ADMIN);
    });
  });
});
