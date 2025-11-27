/**
 * E2E Tests: Complete Appointment Scheduling Workflow
 *
 * This test simulates the entire lifecycle of a patient appointment from an API consumer's
 * perspective. It validates the integration between Patients, Insurance, Authorizations,
 * and Unit Management. All state changes are performed via HTTP requests to ensure
 * a true end-to-end validation.
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from '../setup';
import { createTestUser } from '../helpers/auth.helper';
import { Role, ServiceCode } from '@prisma/client';

let app: Application;

/**
 * Helper to create a service code for tests.
 * @param organizationId The organization ID.
 * @returns The created ServiceCode.
 */
const createTestServiceCode = async (organizationId: string): Promise<ServiceCode> => {
  return prisma.serviceCode.create({
    data: {
      code: `97155-${Math.random()}`, // Avoid collisions
      description: 'Adaptive behavior treatment by protocol',
      category: 'TREATMENT',
      requiredCredentials: [],
      typicalDuration: 60,
      organizationId: organizationId,
    },
  });
};

describe('E2E Appointment Scheduling Workflow', () => {
  beforeAll(async () => {
    const { createApp } = await import('../../app');
    app = createApp();
  });

  it('should handle the full lifecycle: patient setup, auth, reservation, and cancellation', async () => {
    // 1. SETUP: Create Admin and Practitioner for the same organization
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);

    // 2. ONBOARDING (Admin): Create a new patient and their insurance via API
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
    const patientData = {
      userId: patientUser.id,
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1995-05-10',
      medicalRecordNumber: `MRN-E2E-${Math.random()}`,
    };

    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(patientData)
      .expect(201);
    const patientId = patientRes.body.patient.id;

    // 3. AUTHORIZATION (Admin): Create an authorization for the patient
    const authData = {
      patientId: patientId,
      serviceCodeId: serviceCode.id,
      authNumber: `AUTH-E2E-${Math.random()}`,
      totalUnits: 20,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-12-31T00:00:00.000Z',
    };
    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(authData)
      .expect(201);
    const authorizationId = authRes.body.id;

    // 4. SCHEDULING (Practitioner): Reserve units for an appointment
    const reserveRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 5 })
      .expect(200);
    expect(reserveRes.body.scheduledUnits).toBe(5);

    // 5. VERIFICATION (Practitioner): Check available units
    const availableRes = await request(app)
      .get(`/api/authorizations/${authorizationId}/available-units`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .expect(200);
    expect(availableRes.body.availableUnits).toBe(15); // 20 total - 5 scheduled = 15

    // 6. CANCELLATION (Practitioner): Release the reserved units
    const releaseRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/release`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 5 })
      .expect(200);
    expect(releaseRes.body.scheduledUnits).toBe(0);

    // 7. FINAL VERIFICATION (Practitioner): Ensure units are fully restored
    const finalAvailableRes = await request(app)
      .get(`/api/authorizations/${authorizationId}/available-units`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .expect(200);
    expect(finalAvailableRes.body.availableUnits).toBe(20);
  });

  it('should allow reserving units until exhausted and then reject further reservations', async () => {
    // Setup
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: patientUser.id, firstName: 'Exhaust', lastName: 'Test', dateOfBirth: '2000-01-01', medicalRecordNumber: `MRN-EXH-${Math.random()}` });
    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ patientId: patientRes.body.patient.id, serviceCodeId: serviceCode.id, totalUnits: 8, startDate: '2025-01-01T00:00:00.000Z', endDate: '2025-12-31T00:00:00.000Z' });
    const authorizationId = authRes.body.id;

    // Reserve units in chunks
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 5 })
      .expect(200);

    const secondReserveRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 3 })
      .expect(200);
    expect(secondReserveRes.body.scheduledUnits).toBe(8);

    // Verify exhaustion
    const availableRes = await request(app)
      .get(`/api/authorizations/${authorizationId}/available-units`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .expect(200);
    expect(availableRes.body.availableUnits).toBe(0);

    // Attempt to reserve one more unit
    const failedReserveRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 1 })
      .expect(400);
    expect(failedReserveRes.body.message).toContain('Insufficient units available');
  });

  it('should reject reserving more units than are available in a single request', async () => {
    // Setup
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: patientUser.id, firstName: 'Insufficient', lastName: 'Test', dateOfBirth: '2000-01-01', medicalRecordNumber: `MRN-INS-${Math.random()}` });
    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ patientId: patientRes.body.patient.id, serviceCodeId: serviceCode.id, totalUnits: 15, startDate: '2025-01-01T00:00:00.000Z', endDate: '2025-12-31T00:00:00.000Z' });
    const authorizationId = authRes.body.id;

    // 1. Attempt to reserve more than the total amount
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 20 }) // More than the 15 total
      .expect(400);

    // 2. Reserve some units successfully
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 10 })
      .expect(200);

    // 3. Attempt to reserve more than the remaining amount
    const failedReserveRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 6 }) // Only 5 are left
      .expect(400);

    expect(failedReserveRes.body.message).toBe('Insufficient units available. Available: 5, Requested: 6');
  });
});
