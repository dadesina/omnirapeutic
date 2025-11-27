/**
 * E2E Tests: Complete Session Delivery and Unit Consumption Workflow
 *
 * This test simulates the lifecycle of a delivered session from an API consumer's perspective.
 * It validates that reserved units can be consumed correctly, that running totals for an
 * authorization are accurate, and that authorizations transition to an EXHAUSTED state
 * when all units are used.
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from '../setup';
import { createTestUser } from '../helpers/auth.helper';
import { Role, ServiceCode, AuthStatus } from '@prisma/client';

let app: Application;

/**
 * Helper to create a service code for tests.
 * @param organizationId The organization ID.
 * @returns The created ServiceCode.
 */
const createTestServiceCode = async (organizationId: string): Promise<ServiceCode> => {
  return prisma.serviceCode.create({
    data: {
      code: `97153-E2E-${Math.random()}`, // Avoid collisions
      description: 'Adaptive behavior treatment by protocol, E2E',
      category: 'TREATMENT',
      requiredCredentials: [],
      typicalDuration: 60,
      organizationId: organizationId,
    },
  });
};

describe('E2E Session Completion Workflow', () => {
  beforeAll(async () => {
    const { createApp } = await import('../../app');
    app = createApp();
  });

  it('should handle a single session delivery: reserve, consume, and verify totals', async () => {
    // 1. SETUP: Create users, patient, service code, and authorization
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        userId: patientUser.id,
        firstName: 'Session',
        lastName: 'Delivery',
        dateOfBirth: '1998-03-15',
        medicalRecordNumber: `MRN-SESS-${Math.random()}`,
      })
      .expect(201);
    const patientId = patientRes.body.patient.id;

    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        patientId,
        serviceCodeId: serviceCode.id,
        totalUnits: 50,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T00:00:00.000Z',
      })
      .expect(201);
    const authorizationId = authRes.body.id;

    // 2. SCHEDULING: Reserve units for the session
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 8 })
      .expect(200);

    // 3. VERIFY RESERVATION: Check available units before consumption
    const availableRes = await request(app)
      .get(`/api/authorizations/${authorizationId}/available-units`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .expect(200);
    expect(availableRes.body.availableUnits).toBe(42); // 50 total - 8 scheduled = 42

    // 4. DELIVERY: Consume the reserved units post-session
    const consumeRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/consume`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 8 })
      .expect(200);
    expect(consumeRes.body.scheduledUnits).toBe(0);
    expect(consumeRes.body.usedUnits).toBe(8);

    // 5. FINAL VERIFICATION: Ensure totals are correct
    const finalCheck = await request(app)
      .get(`/api/authorizations/${authorizationId}/available-units`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .expect(200);
    expect(finalCheck.body.availableUnits).toBe(42); // 50 total - 8 used = 42
    expect(finalCheck.body.usedUnits).toBe(8);
    expect(finalCheck.body.scheduledUnits).toBe(0);
  });

  it('should track running totals correctly across multiple delivered sessions', async () => {
    // 1. SETUP
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: patientUser.id, firstName: 'Multi', lastName: 'Session', dateOfBirth: '2001-11-20', medicalRecordNumber: `MRN-MULTI-${Math.random()}` });
    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ patientId: patientRes.body.patient.id, serviceCodeId: serviceCode.id, totalUnits: 100, startDate: '2025-01-01T00:00:00.000Z', endDate: '2025-12-31T00:00:00.000Z' });
    const authorizationId = authRes.body.id;

    // 2. SESSION 1: Reserve and consume 15 units
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 15 });
    const consume1Res = await request(app)
      .post(`/api/authorizations/${authorizationId}/consume`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 15 });
    expect(consume1Res.body.usedUnits).toBe(15);
    expect(consume1Res.body.scheduledUnits).toBe(0);

    // 3. SESSION 2: Reserve and consume another 15 units
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 15 });
    const consume2Res = await request(app)
      .post(`/api/authorizations/${authorizationId}/consume`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 15 });
    expect(consume2Res.body.usedUnits).toBe(30);
    expect(consume2Res.body.scheduledUnits).toBe(0);

    // 4. FINAL VERIFICATION
    const finalCheck = await request(app)
      .get(`/api/authorizations/${authorizationId}`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .expect(200);
    expect(finalCheck.body.totalUnits).toBe(100);
    expect(finalCheck.body.usedUnits).toBe(30);
    expect(finalCheck.body.scheduledUnits).toBe(0);
    const availableUnits = finalCheck.body.totalUnits - finalCheck.body.usedUnits - finalCheck.body.scheduledUnits;
    expect(availableUnits).toBe(70);
  });

  it('should transition authorization to EXHAUSTED status upon full consumption', async () => {
    // 1. SETUP with a small number of units
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: patientUser.id, firstName: 'Exhaust', lastName: 'Flow', dateOfBirth: '2005-01-01', medicalRecordNumber: `MRN-EXH-FLOW-${Math.random()}` });
    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ patientId: patientRes.body.patient.id, serviceCodeId: serviceCode.id, totalUnits: 12, startDate: '2025-01-01T00:00:00.000Z', endDate: '2025-12-31T00:00:00.000Z' });
    const authorizationId = authRes.body.id;

    // 2. Reserve and consume all units
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 12 });

    const consumeRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/consume`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 12 })
      .expect(200);

    // 3. VERIFY EXHAUSTION
    expect(consumeRes.body.usedUnits).toBe(12);
    expect(consumeRes.body.scheduledUnits).toBe(0);
    expect(consumeRes.body.status).toBe(AuthStatus.EXHAUSTED);

    // 4. VERIFY no further reservations are possible
    await request(app)
      .post(`/api/authorizations/${authorizationId}/reserve`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 1 })
      .expect(400)
      .then(res => {
        expect(res.body.message).toContain('inactive authorization');
      });
  });

  it('should reject consuming units that have not been scheduled', async () => {
    // 1. SETUP
    const admin = await createTestUser(Role.ADMIN);
    const practitioner = await createTestUser(Role.PRACTITIONER, false, admin.organizationId!);
    const serviceCode = await createTestServiceCode(admin.organizationId!);
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);
    const patientRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: patientUser.id, firstName: 'No', lastName: 'Reservation', dateOfBirth: '2002-02-02', medicalRecordNumber: `MRN-NORES-${Math.random()}` });
    const authRes = await request(app)
      .post('/api/authorizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ patientId: patientRes.body.patient.id, serviceCodeId: serviceCode.id, totalUnits: 30, startDate: '2025-01-01T00:00:00.000Z', endDate: '2025-12-31T00:00:00.000Z' });
    const authorizationId = authRes.body.id;

    // 2. ATTEMPT CONSUMPTION with scheduledUnits at 0
    const consumeRes = await request(app)
      .post(`/api/authorizations/${authorizationId}/consume`)
      .set('Authorization', `Bearer ${practitioner.token}`)
      .send({ units: 5 })
      .expect(400);

    expect(consumeRes.body.message).toContain('Cannot consume more units than are scheduled');
  });
});
