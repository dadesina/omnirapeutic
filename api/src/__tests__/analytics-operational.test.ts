/**
 * Operational Analytics Tests
 *
 * Test suite for Phase 6 Stage 2 operational analytics endpoints:
 * - Practitioner utilization
 * - Patient session history
 * - Session completion rate
 * - Appointment analytics
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
import { createTestSession, createMultipleSessions } from './helpers/session.helper';
import { createTestAppointment } from './helpers/appointment.helper';

let app: Application;

// ============================================================================
// Practitioner Utilization Tests
// ============================================================================

describe('Practitioner Utilization Analytics', () => {
  let admin: any;
  let practitioner1: any;
  let practitioner2: any;
  let patient: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    // Create admin and practitioners
    admin = await createTestUser(Role.ADMIN);
    practitioner1 = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    practitioner2 = await createCompleteTestPractitioner('Pract2!@#', admin.organizationId!);

    // Create patient
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
  });

  it('should return practitioner utilization for ADMIN', async () => {
    // Create 3 sessions for practitioner1
    const now = new Date();
    const session1Start = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const session1End = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      startTime: session1Start,
      endTime: session1End,
      unitsUsed: 4,
    });

    const session2Start = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5 hours ago
    const session2End = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      startTime: session2Start,
      endTime: session2End,
      unitsUsed: 8,
    });

    const response = await request(app)
      .get(`/api/practitioners/${practitioner1.practitioner.id}/utilization`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      practitionerId: practitioner1.practitioner.id,
      practitionerName: `${practitioner1.practitioner.firstName} ${practitioner1.practitioner.lastName}`,
      metrics: {
        totalSessions: 2,
        completedSessions: 2,
        cancelledSessions: 0,
        totalHoursWorked: 3, // 1 hour + 2 hours
        totalUnitsDelivered: 12, // 4 + 8
        uniquePatients: 1,
        averageSessionDuration: 90, // (60 + 120) / 2 = 90 minutes
      },
    });

    expect(response.body.sessionsByDate).toBeInstanceOf(Array);
    expect(response.body.sessionsByDate.length).toBeGreaterThanOrEqual(1);
  });

  it('should allow PRACTITIONER to view own utilization', async () => {
    // Generate token for practitioner1's user
    const practitionerToken = generateTestToken(
      practitioner1.user.id,
      practitioner1.user.email,
      practitioner1.user.role,
      practitioner1.user.organizationId,
      practitioner1.user.isSuperAdmin
    );

    // Create session for practitioner1
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
    });

    const response = await request(app)
      .get(`/api/practitioners/${practitioner1.practitioner.id}/utilization`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(200);

    expect(response.body.practitionerId).toBe(practitioner1.practitioner.id);
    expect(response.body.metrics.totalSessions).toBe(1);
  });

  it('should return 403 if PRACTITIONER tries to view another practitioner', async () => {
    // Generate token for practitioner1's user
    const practitionerToken = generateTestToken(
      practitioner1.user.id,
      practitioner1.user.email,
      practitioner1.user.role,
      practitioner1.user.organizationId,
      practitioner1.user.isSuperAdmin
    );

    // Try to access practitioner2's utilization
    const response = await request(app)
      .get(`/api/practitioners/${practitioner2.practitioner.id}/utilization`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/Forbidden/);
  });

  it('should return 403 for PATIENT role', async () => {
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

    const response = await request(app)
      .get(`/api/practitioners/${practitioner1.practitioner.id}/utilization`)
      .set('Authorization', `Bearer ${patientUser.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/Forbidden/);
  });

  it('should filter by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Create session yesterday
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      startTime: yesterday,
      endTime: new Date(yesterday.getTime() + 60 * 60 * 1000),
    });

    // Create session two days ago
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      startTime: twoDaysAgo,
      endTime: new Date(twoDaysAgo.getTime() + 60 * 60 * 1000),
    });

    // Query for yesterday only
    const response = await request(app)
      .get(`/api/practitioners/${practitioner1.practitioner.id}/utilization`)
      .query({
        startDate: yesterday.toISOString(),
        endDate: now.toISOString(),
      })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    // Should only include yesterday's session
    expect(response.body.metrics.totalSessions).toBe(1);
  });

  it('should return 403 for cross-organization access', async () => {
    // Create another organization with admin
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/practitioners/${practitioner1.practitioner.id}/utilization`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent practitioner', async () => {
    const response = await request(app)
      .get('/api/practitioners/non-existent-id/utilization')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should calculate metrics correctly with multiple patients', async () => {
    // Create second patient
    const patient2Data = await createCompleteTestPatient('Patient456!@#', admin.organizationId!);
    const patient2 = patient2Data.patient;

    // Create sessions with different patients
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      unitsUsed: 4,
    });

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient2.id,
      practitionerId: practitioner1.practitioner.id,
      unitsUsed: 4,
    });

    const response = await request(app)
      .get(`/api/practitioners/${practitioner1.practitioner.id}/utilization`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.metrics.uniquePatients).toBe(2);
    expect(response.body.metrics.totalSessions).toBe(2);
    expect(response.body.metrics.totalUnitsDelivered).toBe(8);
  });
});

// ============================================================================
// Patient Session History Tests
// ============================================================================

describe('Patient Session History', () => {
  let admin: any;
  let practitioner: any;
  let patient: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
  });

  it('should return session history for ADMIN', async () => {
    // Create 3 sessions
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      unitsUsed: 4,
    });

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      unitsUsed: 8,
    });

    const response = await request(app)
      .get(`/api/patients/${patient.id}/session-history`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      summary: {
        totalSessions: 2,
        completedSessions: 2,
        cancelledSessions: 0,
        totalUnitsDelivered: 12,
      },
    });

    expect(response.body.sessions).toBeInstanceOf(Array);
    expect(response.body.sessions.length).toBe(2);
    expect(response.body.sessions[0]).toHaveProperty('sessionId');
    expect(response.body.sessions[0]).toHaveProperty('practitionerName');
    expect(response.body.sessions[0]).toHaveProperty('serviceCodeDescription');
  });

  it('should allow PRACTITIONER to view session history', async () => {
    const practitionerToken = generateTestToken(
      practitioner.user.id,
      practitioner.user.email,
      practitioner.user.role,
      practitioner.user.organizationId,
      practitioner.user.isSuperAdmin
    );

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
    });

    const response = await request(app)
      .get(`/api/patients/${patient.id}/session-history`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(200);

    expect(response.body.patientId).toBe(patient.id);
    expect(response.body.summary.totalSessions).toBe(1);
  });

  it('should allow PATIENT to view own session history', async () => {
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

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: testPatient.id,
      practitionerId: practitioner.practitioner.id,
    });

    const response = await request(app)
      .get(`/api/patients/${testPatient.id}/session-history`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    expect(response.body.patientId).toBe(testPatient.id);
    expect(response.body.summary.totalSessions).toBe(1);
  });

  it('should return 403 if PATIENT tries to view another patient history', async () => {
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
      .get(`/api/patients/${patient.id}/session-history`)
      .set('Authorization', `Bearer ${patient2Token}`)
      .expect(403);

    expect(response.body.error).toMatch(/Forbidden/);
  });

  it('should filter by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Session yesterday
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: yesterday,
      endTime: new Date(yesterday.getTime() + 60 * 60 * 1000),
    });

    // Session two days ago
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: twoDaysAgo,
      endTime: new Date(twoDaysAgo.getTime() + 60 * 60 * 1000),
    });

    // Query for yesterday only
    const response = await request(app)
      .get(`/api/patients/${patient.id}/session-history`)
      .query({
        startDate: yesterday.toISOString(),
        endDate: now.toISOString(),
      })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.summary.totalSessions).toBe(1);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/patients/${patient.id}/session-history`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent patient', async () => {
    const response = await request(app)
      .get('/api/patients/non-existent-id/session-history')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });
});

// ============================================================================
// Organization Practitioner Utilization Tests
// ============================================================================

describe('Organization Practitioner Utilization', () => {
  let admin: any;
  let practitioner1: any;
  let practitioner2: any;
  let patient: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner1 = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    practitioner2 = await createCompleteTestPractitioner('Pract2!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
  });

  it('should return organization-wide utilization for ADMIN', async () => {
    // Create sessions for both practitioners
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      unitsUsed: 4,
    });

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner2.practitioner.id,
      unitsUsed: 6,
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/practitioner-utilization`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      organizationId: admin.organizationId,
      practitioners: expect.any(Array),
      organizationTotals: {
        totalPractitioners: 2,
        totalSessions: 2,
        completedSessions: 2,
        cancelledSessions: 0,
        totalUnitsDelivered: 10,
      },
    });

    expect(response.body.practitioners.length).toBe(2);
    expect(response.body.organizationTotals.totalUniquePatients).toBe(1);
  });

  it('should return 403 for PRACTITIONER role', async () => {
    const practitionerToken = generateTestToken(
      practitioner1.user.id,
      practitioner1.user.email,
      practitioner1.user.role,
      practitioner1.user.organizationId,
      practitioner1.user.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/practitioner-utilization`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should return 403 for PATIENT role', async () => {
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/practitioner-utilization`)
      .set('Authorization', `Bearer ${patientUser.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should filter by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Session yesterday
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      startTime: yesterday,
      endTime: new Date(yesterday.getTime() + 60 * 60 * 1000),
    });

    // Session two days ago
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      startTime: twoDaysAgo,
      endTime: new Date(twoDaysAgo.getTime() + 60 * 60 * 1000),
    });

    // Query for yesterday only
    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/practitioner-utilization`)
      .query({
        startDate: yesterday.toISOString(),
        endDate: now.toISOString(),
      })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    // Should only include yesterday's session
    expect(response.body.organizationTotals.totalSessions).toBe(1);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/practitioner-utilization`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent organization', async () => {
    const response = await request(app)
      .get('/api/organizations/non-existent-id/practitioner-utilization')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should calculate totals correctly with multiple practitioners', async () => {
    // Practitioner 1: 2 sessions
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      unitsUsed: 4,
    });

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner1.practitioner.id,
      unitsUsed: 4,
    });

    // Practitioner 2: 1 session
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner2.practitioner.id,
      unitsUsed: 8,
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/practitioner-utilization`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.organizationTotals).toMatchObject({
      totalPractitioners: 2,
      totalSessions: 3,
      completedSessions: 3,
      cancelledSessions: 0,
      totalUnitsDelivered: 16,
      totalUniquePatients: 1,
    });

    // Check individual practitioner stats
    const pract1Stats = response.body.practitioners.find(
      (p: any) => p.practitionerId === practitioner1.practitioner.id
    );
    const pract2Stats = response.body.practitioners.find(
      (p: any) => p.practitionerId === practitioner2.practitioner.id
    );

    expect(pract1Stats.totalSessions).toBe(2);
    expect(pract1Stats.totalUnitsDelivered).toBe(8);
    expect(pract2Stats.totalSessions).toBe(1);
    expect(pract2Stats.totalUnitsDelivered).toBe(8);
  });
});

// ============================================================================
// Session Completion Rate Tests
// ============================================================================

describe('Session Completion Rate', () => {
  let admin: any;
  let practitioner: any;
  let patient: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
  });

  it('should return completion rate for ADMIN', async () => {
    // Create 3 completed sessions and 1 cancelled session
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
    });

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
    });

    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
    });

    // Create cancelled session
    const cancelledSession = await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
    });

    // Mark as cancelled
    await prisma.session.update({
      where: { id: cancelledSession.id },
      data: { status: 'CANCELLED' },
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/completion-rate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      organizationId: admin.organizationId,
      overallMetrics: {
        totalSessions: 4,
        completedSessions: 3,
        cancelledSessions: 1,
        completionRate: 75,
        cancellationRate: 25,
      },
    });

    expect(response.body.trendByDate).toBeInstanceOf(Array);
  });

  it('should return 403 for PRACTITIONER role', async () => {
    const practitionerToken = generateTestToken(
      practitioner.user.id,
      practitioner.user.email,
      practitioner.user.role,
      practitioner.user.organizationId,
      practitioner.user.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/completion-rate`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should return 403 for PATIENT role', async () => {
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/completion-rate`)
      .set('Authorization', `Bearer ${patientUser.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should filter by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Session yesterday
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: yesterday,
      endTime: new Date(yesterday.getTime() + 60 * 60 * 1000),
    });

    // Session two days ago
    await createTestSession({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: twoDaysAgo,
      endTime: new Date(twoDaysAgo.getTime() + 60 * 60 * 1000),
    });

    // Query for yesterday only
    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/completion-rate`)
      .query({
        startDate: yesterday.toISOString(),
        endDate: now.toISOString(),
      })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    // Should only include yesterday's session
    expect(response.body.overallMetrics.totalSessions).toBe(1);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/completion-rate`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent organization', async () => {
    const response = await request(app)
      .get('/api/organizations/non-existent-id/completion-rate')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should calculate completion rate correctly', async () => {
    // Create 7 completed and 3 cancelled = 70% completion rate
    for (let i = 0; i < 7; i++) {
      await createTestSession({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.practitioner.id,
      });
    }

    for (let i = 0; i < 3; i++) {
      const session = await createTestSession({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.practitioner.id,
      });

      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'CANCELLED' },
      });
    }

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/completion-rate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.overallMetrics).toMatchObject({
      totalSessions: 10,
      completedSessions: 7,
      cancelledSessions: 3,
      completionRate: 70,
      cancellationRate: 30,
    });
  });
});

// ============================================================================
// Appointment Analytics Tests
// ============================================================================

describe('Appointment Analytics', () => {
  let admin: any;
  let practitioner: any;
  let patient: any;

  beforeAll(async () => {
    const { createApp } = await import('../app');
    app = createApp();
  });

  beforeEach(async () => {
    admin = await createTestUser(Role.ADMIN);
    practitioner = await createCompleteTestPractitioner('Pract1!@#', admin.organizationId!);
    const patientData = await createCompleteTestPatient('Patient123!@#', admin.organizationId!);
    patient = patientData.patient;
  });

  it('should return appointment analytics for ADMIN', async () => {
    // Create appointments with different statuses
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 3 completed
    for (let i = 0; i < 3; i++) {
      const appointment = await createTestAppointment({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.practitioner.id,
        startTime: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000),
      });

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'COMPLETED' },
      });
    }

    // 1 cancelled
    const cancelledAppt = await createTestAppointment({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: tomorrow,
    });

    await prisma.appointment.update({
      where: { id: cancelledAppt.id },
      data: { status: 'CANCELLED' },
    });

    // 1 no-show
    const noShowAppt = await createTestAppointment({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    });

    await prisma.appointment.update({
      where: { id: noShowAppt.id },
      data: { status: 'NO_SHOW' },
    });

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/appointment-analytics`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      organizationId: admin.organizationId,
      overallMetrics: {
        totalAppointments: 5,
        completedAppointments: 3,
        cancelledAppointments: 1,
        noShowAppointments: 1,
        scheduledAppointments: 0,
        completionRate: 60,
        noShowRate: 20,
      },
    });

    expect(response.body.appointmentsByStatus).toBeInstanceOf(Array);
    expect(response.body.appointmentsByStatus.length).toBe(4);
    expect(response.body.trendByDate).toBeInstanceOf(Array);
  });

  it('should return 403 for PRACTITIONER role', async () => {
    const practitionerToken = generateTestToken(
      practitioner.user.id,
      practitioner.user.email,
      practitioner.user.role,
      practitioner.user.organizationId,
      practitioner.user.isSuperAdmin
    );

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/appointment-analytics`)
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should return 403 for PATIENT role', async () => {
    const patientUser = await createTestUser(Role.PATIENT, false, admin.organizationId!);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/appointment-analytics`)
      .set('Authorization', `Bearer ${patientUser.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/administrator/);
  });

  it('should filter by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Appointment yesterday
    await createTestAppointment({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: yesterday,
    });

    // Appointment two days ago
    await createTestAppointment({
      organizationId: admin.organizationId!,
      patientId: patient.id,
      practitionerId: practitioner.practitioner.id,
      startTime: twoDaysAgo,
    });

    // Query for yesterday only
    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/appointment-analytics`)
      .query({
        startDate: yesterday.toISOString(),
        endDate: now.toISOString(),
      })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    // Should only include yesterday's appointment
    expect(response.body.overallMetrics.totalAppointments).toBe(1);
  });

  it('should return 403 for cross-organization access', async () => {
    const admin2 = await createTestUser(Role.ADMIN);

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/appointment-analytics`)
      .set('Authorization', `Bearer ${admin2.token}`)
      .expect(403);

    expect(response.body.error).toMatch(/organization/);
  });

  it('should return 404 for non-existent organization', async () => {
    const response = await request(app)
      .get('/api/organizations/non-existent-id/appointment-analytics')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);

    expect(response.body.error).toMatch(/not found/);
  });

  it('should calculate status distribution correctly', async () => {
    const now = new Date();

    // Create 10 appointments: 5 completed, 3 cancelled, 2 no-show
    for (let i = 0; i < 5; i++) {
      const appt = await createTestAppointment({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.practitioner.id,
        startTime: new Date(now.getTime() - i * 60 * 60 * 1000),
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: 'COMPLETED' },
      });
    }

    for (let i = 0; i < 3; i++) {
      const appt = await createTestAppointment({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.practitioner.id,
        startTime: new Date(now.getTime() + (i + 1) * 60 * 60 * 1000),
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: 'CANCELLED' },
      });
    }

    for (let i = 0; i < 2; i++) {
      const appt = await createTestAppointment({
        organizationId: admin.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.practitioner.id,
        startTime: new Date(now.getTime() - (i + 6) * 60 * 60 * 1000),
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: 'NO_SHOW' },
      });
    }

    const response = await request(app)
      .get(`/api/organizations/${admin.organizationId}/appointment-analytics`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.overallMetrics).toMatchObject({
      totalAppointments: 10,
      completedAppointments: 5,
      cancelledAppointments: 3,
      noShowAppointments: 2,
      completionRate: 50,
      noShowRate: 20,
    });

    // Check appointmentsByStatus
    const completedStatus = response.body.appointmentsByStatus.find((s: any) => s.status === 'COMPLETED');
    const cancelledStatus = response.body.appointmentsByStatus.find((s: any) => s.status === 'CANCELLED');
    const noShowStatus = response.body.appointmentsByStatus.find((s: any) => s.status === 'NO_SHOW');

    expect(completedStatus).toMatchObject({ count: 5, percentage: 50 });
    expect(cancelledStatus).toMatchObject({ count: 3, percentage: 30 });
    expect(noShowStatus).toMatchObject({ count: 2, percentage: 20 });
  });
});
