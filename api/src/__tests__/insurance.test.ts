/**
 * Insurance Endpoint Tests
 *
 * Tests for Patient Insurance CRUD operations with RBAC, organization scoping,
 * and audit logging for HIPAA compliance.
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { createTestUser } from './helpers/auth.helper';
import { createCompleteTestPatient } from './helpers/factories';
import { Role } from '@prisma/client';

let app: Application;

describe('Insurance Endpoints', () => {
  beforeAll(async () => {
    // Dynamic import to delay loading until AFTER setup.ts configures test environment
    const { createApp } = await import('../app');
    app = createApp();
  });

  describe('POST /api/insurance - Create Insurance', () => {
    it('should create a new insurance record as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);

      const insuranceData = {
        patientId: patient.id,
        payerName: 'United Health',
        memberNumber: 'UHC123456789',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        isActive: true,
      };

      const response = await request(app)
        .post('/api/insurance')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(insuranceData)
        .expect(201);

      expect(response.body.payerName).toBe('United Health');
      expect(response.body.patientId).toBe(patient.id);
      expect(response.body.isActive).toBe(true);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: admin.id,
          action: 'CREATE_INSURANCE',
          resource: 'insurance',
          resourceId: response.body.id,
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject creation as PRACTITIONER (forbidden)', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);

      const insuranceData = {
        patientId: patient.id,
        payerName: 'United Health',
        memberNumber: 'UHC123456789',
        effectiveDate: '2025-01-01T00:00:00.000Z',
      };

      await request(app)
        .post('/api/insurance')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(insuranceData)
        .expect(403);
    });

    it('should reject creation with missing required fields', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);

      const insuranceData = { patientId: patient.id, payerName: 'Aetna' }; // Missing memberNumber and effectiveDate

      const response = await request(app)
        .post('/api/insurance')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(insuranceData)
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('required');
    });

    it('should reject ADMIN creating insurance for a patient in another organization', async () => {
      const org1 = await prisma.organization.create({
        data: {
          name: 'Org One',
          type: 'CLINIC',
          status: 'ACTIVE',
          tier: 'TRIAL'
        }
      });
      const org2 = await prisma.organization.create({
        data: {
          name: 'Org Two',
          type: 'CLINIC',
          status: 'ACTIVE',
          tier: 'TRIAL'
        }
      });

      const adminInOrg1 = await createTestUser(Role.ADMIN, false, org1.id);
      const { patient: patientInOrg2 } = await createCompleteTestPatient('Test1234!', org2.id);

      const insuranceData = {
        patientId: patientInOrg2.id,
        payerName: 'Cigna',
        memberNumber: 'CIGNA98765',
        effectiveDate: '2025-01-01T00:00:00.000Z',
      };

      await request(app)
        .post('/api/insurance')
        .set('Authorization', `Bearer ${adminInOrg1.token}`)
        .send(insuranceData)
        .expect(403);
    });
  });

  describe('GET /api/insurance - List Insurance', () => {
    it('should list insurance records for an ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          payerName: 'Test Payer',
          memberNumber: 'LISTTEST001',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const response = await request(app)
        .get('/api/insurance')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('insurance');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.insurance.length).toBeGreaterThanOrEqual(1);
    });

    it('should list insurance records for a PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: practitioner.organizationId!,
          payerName: 'Test Payer',
          memberNumber: 'LISTTEST002',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const response = await request(app)
        .get('/api/insurance')
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(200);

      expect(response.body.insurance.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject listing for a PATIENT', async () => {
      const patientUser = await createTestUser(Role.PATIENT);
      await request(app)
        .get('/api/insurance')
        .set('Authorization', `Bearer ${patientUser.token}`)
        .expect(403);
    });
  });

  describe('GET /api/insurance/:id - Get Insurance by ID', () => {
    it('should get an insurance record by ID as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          payerName: 'GetByID Payer',
          memberNumber: 'GETBYID001',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const response = await request(app)
        .get(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.id).toBe(insurance.id);
      expect(response.body.payerName).toBe('GetByID Payer');
    });

    it('should allow a PATIENT to get their own insurance record', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { user, patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: user.organizationId!,
          payerName: 'PatientOwn Payer',
          memberNumber: 'PATIENTOWN01',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      // Generate token for the patient user that owns this record
      const jwt = require('jsonwebtoken');
      const jwtSecret = process.env.JWT_SECRET || 'test-secret';
      const patientToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          isSuperAdmin: user.isSuperAdmin
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.id).toBe(insurance.id);
    });

    it('should forbid a PATIENT from getting another patient\'s insurance record', async () => {
      const patientUser1 = await createTestUser(Role.PATIENT);
      const { patient: patient2 } = await createCompleteTestPatient('Test1234!', patientUser1.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient2.id,
          organizationId: patientUser1.organizationId!,
          payerName: 'OtherPatient Payer',
          memberNumber: 'OTHERPATIENT01',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      await request(app)
        .get(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${patientUser1.token}`)
        .expect(403);
    });

    it('should return 404 for a non-existent insurance ID', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app)
        .get(`/api/insurance/${nonExistentId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /api/insurance/patients/:patientId/insurance - Get Insurance by Patient', () => {
    it('should get all insurance records for a patient as an ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          payerName: 'Payer One',
          memberNumber: 'BYPATIENT01',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const response = await request(app)
        .get(`/api/insurance/patients/${patient.id}/insurance`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].patientId).toBe(patient.id);
    });

    it('should forbid getting insurance for a patient in another organization', async () => {
      const org1 = await prisma.organization.create({
        data: {
          name: 'Org One Get',
          type: 'CLINIC',
          status: 'ACTIVE',
          tier: 'TRIAL'
        }
      });
      const org2 = await prisma.organization.create({
        data: {
          name: 'Org Two Get',
          type: 'CLINIC',
          status: 'ACTIVE',
          tier: 'TRIAL'
        }
      });

      const adminInOrg1 = await createTestUser(Role.ADMIN, false, org1.id);
      const { patient: patientInOrg2 } = await createCompleteTestPatient('Test1234!', org2.id);

      await request(app)
        .get(`/api/insurance/patients/${patientInOrg2.id}/insurance`)
        .set('Authorization', `Bearer ${adminInOrg1.token}`)
        .expect(403);
    });
  });

  describe('PUT /api/insurance/:id - Update Insurance', () => {
    it('should update an insurance record as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          payerName: 'Original Payer',
          memberNumber: 'UPDATE001',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const updates = { payerName: 'Updated Payer Name' };

      const response = await request(app)
        .put(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.payerName).toBe('Updated Payer Name');

      const auditLog = await prisma.auditLog.findFirst({
        where: { userId: admin.id, action: 'UPDATE_INSURANCE' },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.resourceId).toBe(insurance.id);
    });

    it('should reject update as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: practitioner.organizationId!,
          payerName: 'Payer To Block',
          memberNumber: 'UPDATE002',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      await request(app)
        .put(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send({ payerName: 'New Name' })
        .expect(403);
    });
  });

  describe('DELETE /api/insurance/:id - Delete Insurance', () => {
    it('should delete an insurance record as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          payerName: 'To Be Deleted',
          memberNumber: 'DELETE001',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      await request(app)
        .delete(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(204);

      const found = await prisma.patientInsurance.findUnique({ where: { id: insurance.id } });
      expect(found).toBeNull();

      const auditLog = await prisma.auditLog.findFirst({
        where: { userId: admin.id, action: 'DELETE_INSURANCE', resourceId: insurance.id },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject deletion as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: practitioner.organizationId!,
          payerName: 'Payer To Block Deletion',
          memberNumber: 'DELETE002',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      await request(app)
        .delete(`/api/insurance/${insurance.id}`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .expect(403);
    });
  });

  describe('POST /api/insurance/:id/verify - Verify Eligibility', () => {
    it('should verify insurance eligibility as ADMIN', async () => {
      const admin = await createTestUser(Role.ADMIN);
      const { patient } = await createCompleteTestPatient('Test1234!', admin.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: admin.organizationId!,
          payerName: 'Verify Payer',
          memberNumber: 'VERIFY001',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const verificationData = {
        verifiedBy: admin.id,
        coverageActive: true,
        planName: 'Gold PPO',
        copayAmount: 25.50,
      };

      const response = await request(app)
        .post(`/api/insurance/${insurance.id}/verify`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(verificationData)
        .expect(200);

      expect(response.body.eligibilityVerification).toBeDefined();
      expect(response.body.eligibilityVerification.coverageActive).toBe(true);
      expect(response.body.eligibilityVerification.planName).toBe('Gold PPO');

      const auditLog = await prisma.auditLog.findFirst({
        where: { userId: admin.id, action: 'VERIFY_ELIGIBILITY', resourceId: insurance.id },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject eligibility verification as PRACTITIONER', async () => {
      const practitioner = await createTestUser(Role.PRACTITIONER);
      const { patient } = await createCompleteTestPatient('Test1234!', practitioner.organizationId!);
      const insurance = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          organizationId: practitioner.organizationId!,
          payerName: 'Payer To Block Verification',
          memberNumber: 'VERIFY002',
          effectiveDate: new Date('2025-01-01'),
        },
      });

      const verificationData = { verifiedBy: practitioner.id, coverageActive: true };

      await request(app)
        .post(`/api/insurance/${insurance.id}/verify`)
        .set('Authorization', `Bearer ${practitioner.token}`)
        .send(verificationData)
        .expect(403);
    });
  });
});
