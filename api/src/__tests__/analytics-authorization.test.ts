/**
 * Authorization Analytics Tests
 *
 * Test suite for Phase 6 Stage 3 authorization and billing analytics endpoints:
 * - Authorization utilization (patient-level)
 * - Organization authorization overview
 * - Expiring authorizations alert
 */

import request from 'supertest';
import { Application } from 'express';
import { prisma } from './setup';
import { Role } from '@prisma/client';
import {
  createTestUser,
  generateTestToken,
} from './helpers/auth.helper';
import { createCompleteTestPractitioner, createCompleteTestPatient } from './helpers/factories';
import { createTestAuthorization, createTestServiceCode } from './helpers/appointment.helper';

let app: Application;

// ============================================================================
// Authorization Utilization Tests
// ============================================================================

describe('Authorization Utilization', () => {
  let admin: any;
  let practitioner: any;
  let patient: any;
  let serviceCode: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
    serviceCode = await createTestServiceCode(admin.organizationId!);
  });

  it('should return authorization utilization for ADMIN', async () => {
    // Create authorizations with different statuses
    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    // Active authorization (50% utilized)
    const activeAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: futureDate,
    });

    await prisma.authorization.update({
      where: { id: activeAuth.id },
      data: {
        totalUnits: 100,
        usedUnits: 30,
        scheduledUnits: 20,
      },
    });

    // Expiring soon authorization (30 days)
    const expiringSoonDate = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000); // 25 days from now
    const expiringSoonAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate,
    });

    await prisma.authorization.update({
      where: { id: expiringSoonAuth.id },
      data: {
        totalUnits: 50,
        usedUnits: 10,
        scheduledUnits: 5,
      },
    });

    // Expired authorization
    const expiredAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      endDate: pastDate,
    });

    await prisma.authorization.update({
      where: { id: expiredAuth.id },
      data: {
        totalUnits: 40,
        usedUnits: 20,
        scheduledUnits: 0,
      },
    });

    const response = await request(app)
      .get(`/api/patients/${patient.id}/authorization-utilization`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      patientId: patient.id,
      summary: {
        totalAuthorizations: 3,
        activeAuthorizations: 1,
        expiringSoonAuthorizations: 1,
        expiredAuthorizations: 1,
        depletedAuthorizations: 0,
      },
    });

    expect(response.body.authorizations).toBeInstanceOf(Array);
    expect(response.body.authorizations.length).toBe(3);

    // Check active authorization
    const activeAuthData = response.body.authorizations.find(
      (a: any) => a.authorizationId === activeAuth.id
    );
    expect(activeAuthData).toMatchObject({
      totalUnits: 100,
      usedUnits: 30,
      scheduledUnits: 20,
      remainingUnits: 50,
      utilizationPercentage: 50,
      status: 'active',
    });
  });

  it('should allow PRACTITIONER to view authorization utilization', async () => {
    const practitionerToken = generateTestToken(
      practitioner.user.id,
      practitioner.user.email,
      practitioner.user.role,
      practitioner.user.organizationId,
      practitioner.user.isSuperAdmin
    );

    const now = new Date();
    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app)
      .get(`/api/patients/${patient.id}/authorization-utilization`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(200);

    expect(response.body.patientId).toBe(patient.id);
    expect(response.body.summary.totalAuthorizations).toBe(1);
  });

  it('should allow PATIENT to view own authorization utilization', async () => {
    const patientData = await createCompleteTestPatient('Patient456!@#', admin.organizationId!);
    const testPatient = patientData.patient;
    const testPatientUser = patientData.user;

    const patientToken = generateTestToken(
      testPatientUser.id,
      testPatientUser.email,
      testPatientUser.role,
      testPatientUser.organizationId,
      testPatientUser.isSuperAdmin
    );

    const now = new Date();
    const testServiceCode = await createTestServiceCode(admin.organizationId!);
    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: testPatient.id,
      serviceCodeId: testServiceCode.id,
      startDate: now,
      endDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app)
      .get(`/api/patients/${testPatient.id}/authorization-utilization`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    expect(response.body.patientId).toBe(testPatient.id);
    expect(response.body.summary.totalAuthorizations).toBe(1);
  });

  it('should return 403 if PATIENT tries to view another patient authorization', async () => {
    const patient2Data = await createCompleteTestPatient('Patient456!@#', admin.organizationId!);
    const patient2 = patient2Data.patient;
    const patient2User = patient2Data.user;

    const patient2Token = generateTestToken(
      patient2User.id,
      patient2User.email,
      patient2User.role,
      patient2User.organizationId,
      patient2User.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/patients/${patient.id}/authorization-utilization`)
      .set('Authorization', `Bearer ${patient2Token}`)
      .expect(403);

    expect(response.body.error).toMatch(/Forbidden/);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/patients/${patient.id}/authorization-utilization`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent patient', async () => {
    const response = await request(app)
      .get('/api/patients/non-existent-id/authorization-utilization')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should correctly identify depleted authorizations', async () => {
    const now = new Date();

    // Fully depleted authorization
    const depletedAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    });

    await prisma.authorization.update({
      where: { id: depletedAuth.id },
      data: {
        totalUnits: 50,
        usedUnits: 30,
        scheduledUnits: 20, // 30 + 20 = 50, fully depleted
      },
    });

    const response = await request(app)
      .get(`/api/patients/${patient.id}/authorization-utilization`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.summary.depletedAuthorizations).toBe(1);

    const depletedAuthData = response.body.authorizations.find(
      (a: any) => a.authorizationId === depletedAuth.id
    );
    expect(depletedAuthData).toMatchObject({
      remainingUnits: 0,
      utilizationPercentage: 100,
      status: 'depleted',
    });
  });
});

// ============================================================================
// Organization Authorization Overview Tests
// ============================================================================

describe('Organization Authorization Overview', () => {
  let admin: any;
  let practitioner: any;
  let patient: any;
  let serviceCode: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
    serviceCode = await createTestServiceCode(admin.organizationId!);
  });

  it('should return organization authorization overview for ADMIN', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    // Create multiple authorizations with different statuses
    const activeAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: futureDate,
    });

    await prisma.authorization.update({
      where: { id: activeAuth.id },
      data: {
        totalUnits: 100,
        usedUnits: 30,
        scheduledUnits: 20,
      },
    });

    // Expiring soon authorization
    const expiringSoonDate = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);
    const expiringSoonAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate,
    });

    await prisma.authorization.update({
      where: { id: expiringSoonAuth.id },
      data: {
        totalUnits: 50,
        usedUnits: 40,
        scheduledUnits: 5,
      },
    });

    // Depleted authorization
    const depletedAuth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: futureDate,
    });

    await prisma.authorization.update({
      where: { id: depletedAuth.id },
      data: {
        totalUnits: 40,
        usedUnits: 25,
        scheduledUnits: 15,
      },
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/authorization-overview`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      organizationId: admin.organizationId,
      summary: {
        totalAuthorizations: 3,
        activeAuthorizations: 1,
        expiringSoonAuthorizations: 1,
        depletedAuthorizations: 1,
        totalUnitsAuthorized: 190,
        totalUnitsUsed: 95,
        totalUnitsScheduled: 40,
        totalUnitsRemaining: 55,
      },
    });

    expect(response.body.summary.overallUtilizationPercentage).toBeGreaterThan(70);
    expect(response.body.byServiceCode).toBeInstanceOf(Array);
    expect(response.body.byServiceCode.length).toBeGreaterThan(0);
    expect(response.body.alertsRequired).toMatchObject({
      expiringSoonCount: 1,
      depletedCount: 1,
      highUtilizationCount: 2, // Both expiring-soon (90%) and depleted (100%) are > 80%
    });
  });

  it('should return 403 for PRACTITIONER trying to access org overview', async () => {
    const practitionerToken = generateTestToken(
      practitioner.user.id,
      practitioner.user.email,
      practitioner.user.role,
      practitioner.user.organizationId,
      practitioner.user.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/authorization-overview`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should return 403 for PATIENT trying to access org overview', async () => {
    const patientData = await createCompleteTestPatient('Patient456!@#', admin.organizationId!);
    const testPatient = patientData.patient;
    const testPatientUser = patientData.user;

    const patientToken = generateTestToken(
      testPatientUser.id,
      testPatientUser.email,
      testPatientUser.role,
      testPatientUser.organizationId,
      testPatientUser.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/authorization-overview`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/authorization-overview`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent organization', async () => {
    const response = await request(app)
      .get('/api/organizations/non-existent-id/authorization-overview')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should correctly aggregate by service code', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // Create another service code
    const serviceCode2 = await createTestServiceCode(admin.organizationId!);

    // Create 2 authorizations for serviceCode1
    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: futureDate,
    });

    await prisma.authorization.update({
      where: { id: (await prisma.authorization.findFirst({
        where: { serviceCodeId: serviceCode.id },
        orderBy: { createdAt: 'desc' }
      }))!.id },
      data: {
        totalUnits: 100,
        usedUnits: 30,
        scheduledUnits: 20,
      },
    });

    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: futureDate,
    });

    await prisma.authorization.update({
      where: { id: (await prisma.authorization.findFirst({
        where: { serviceCodeId: serviceCode.id },
        orderBy: { createdAt: 'desc' }
      }))!.id },
      data: {
        totalUnits: 50,
        usedUnits: 15,
        scheduledUnits: 10,
      },
    });

    // Create 1 authorization for serviceCode2
    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode2.id,
      startDate: now,
      endDate: futureDate,
    });

    await prisma.authorization.update({
      where: { id: (await prisma.authorization.findFirst({
        where: { serviceCodeId: serviceCode2.id },
        orderBy: { createdAt: 'desc' }
      }))!.id },
      data: {
        totalUnits: 75,
        usedUnits: 25,
        scheduledUnits: 15,
      },
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/authorization-overview`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.byServiceCode).toBeInstanceOf(Array);
    expect(response.body.byServiceCode.length).toBe(2);

    // Find the service code groups
    const sc1Group = response.body.byServiceCode.find(
      (sc: any) => sc.serviceCode === serviceCode.code
    );
    const sc2Group = response.body.byServiceCode.find(
      (sc: any) => sc.serviceCode === serviceCode2.code
    );

    expect(sc1Group).toMatchObject({
      authorizationCount: 2,
      totalUnits: 150,
      usedUnits: 45,
      scheduledUnits: 30,
      remainingUnits: 75,
    });

    expect(sc2Group).toMatchObject({
      authorizationCount: 1,
      totalUnits: 75,
      usedUnits: 25,
      scheduledUnits: 15,
      remainingUnits: 35,
    });
  });
});

// ============================================================================
// Expiring Authorizations Alert Tests
// ============================================================================

describe('Expiring Authorizations Alert', () => {
  let admin: any;
  let practitioner: any;
  let patient: any;
  let serviceCode: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
    serviceCode = await createTestServiceCode(admin.organizationId!);
  });

  it('should return expiring authorizations for ADMIN', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days (not expiring)
    const expiringSoonDate1 = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000); // 20 days
    const expiringSoonDate2 = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000); // 25 days

    // Not expiring authorization
    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: futureDate,
    });

    // Expiring soon authorization 1
    const expiring1 = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate1,
    });

    await prisma.authorization.update({
      where: { id: expiring1.id },
      data: {
        totalUnits: 100,
        usedUnits: 50,
        scheduledUnits: 20,
      },
    });

    // Expiring soon authorization 2
    const expiring2 = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate2,
    });

    await prisma.authorization.update({
      where: { id: expiring2.id },
      data: {
        totalUnits: 50,
        usedUnits: 10,
        scheduledUnits: 5,
      },
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations?thresholdDays=30`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      organizationId: admin.organizationId,
      thresholdDays: 30,
    });

    expect(response.body.authorizations).toBeInstanceOf(Array);
    expect(response.body.authorizations.length).toBe(2);
    expect(response.body.summary).toMatchObject({
      totalExpiringAuthorizations: 2,
      patientsAffected: 1,
      totalUnitsAtRisk: 65, // (100-50-20) + (50-10-5) = 30 + 35 = 65
    });

    // Verify sorted by end date (earliest first)
    expect(response.body.authorizations[0].authorizationId).toBe(expiring1.id);
    expect(response.body.authorizations[1].authorizationId).toBe(expiring2.id);
  });

  it('should return expiring authorizations for PRACTITIONER', async () => {
    const practitionerToken = generateTestToken(
      practitioner.user.id,
      practitioner.user.email,
      practitioner.user.role,
      practitioner.user.organizationId,
      practitioner.user.isSuperAdmin
    );

    const now = new Date();
    const expiringSoonDate = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate,
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations?thresholdDays=30`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(200);

    expect(response.body.authorizations.length).toBe(1);
    expect(response.body.summary.totalExpiringAuthorizations).toBe(1);
  });

  it('should return 403 for PATIENT trying to access expiring authorizations', async () => {
    const patientData = await createCompleteTestPatient('Patient456!@#', admin.organizationId!);
    const testPatient = patientData.patient;
    const testPatientUser = patientData.user;

    const patientToken = generateTestToken(
      testPatientUser.id,
      testPatientUser.email,
      testPatientUser.role,
      testPatientUser.organizationId,
      testPatientUser.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations?thresholdDays=30`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/practitioners/);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations?thresholdDays=30`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent organization', async () => {
    const response = await request(app)
      .get('/api/organizations/non-existent-id/expiring-authorizations?thresholdDays=30')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should use default threshold of 30 days when not provided', async () => {
    const now = new Date();
    const expiringSoonDate = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);

    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate,
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.thresholdDays).toBe(30);
    expect(response.body.authorizations.length).toBe(1);
  });

  it('should respect custom threshold days', async () => {
    const now = new Date();
    const in10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const in20Days = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: in10Days,
    });

    await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: in20Days,
    });

    // With threshold of 15 days, should only get the 10-day one
    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations?thresholdDays=15`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.thresholdDays).toBe(15);
    expect(response.body.authorizations.length).toBe(1);
  });

  it('should identify high utilization authorizations', async () => {
    const now = new Date();
    const expiringSoonDate = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

    const auth = await createTestAuthorization({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      serviceCodeId: serviceCode.id,
      startDate: now,
      endDate: expiringSoonDate,
    });

    await prisma.authorization.update({
      where: { id: auth.id },
      data: {
        totalUnits: 100,
        usedUnits: 70,
        scheduledUnits: 15, // 85% utilized
      },
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/expiring-authorizations?thresholdDays=30`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.authorizations[0].isHighUtilization).toBe(true);
    expect(response.body.authorizations[0].utilizationPercentage).toBe(85);
  });
});
