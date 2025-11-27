/**
 * Complete Treatment Plan Workflow E2E Test
 *
 * Tests the complete patient journey from registration through treatment,
 * progress tracking, and data collection. Validates that all services
 * integrate correctly and data relationships work as expected.
 */

import { Role, GoalType, GoalStatus, TreatmentPlanStatus } from '@prisma/client';
import { createTestUser } from '../helpers/auth.helper';
import { createCompleteTestPatient } from '../helpers/factories';
import { createTestServiceCode } from '../helpers/service-code.helper';
import { createTestAuthorization } from '../helpers/insurance.helper';
import {
  createTreatmentPlan,
  getTreatmentPlanById,
} from '../../services/treatmentPlan.service';
import {
  createGoal,
  getGoalsByTreatmentPlan,
  calculateGoalProgress,
} from '../../services/goal.service';
import {
  completeAppointmentAndCreateSession,
  getSessionById,
} from '../../services/session.service';
import {
  getProgressNoteBySession,
} from '../../services/progressNote.service';
import {
  createDataPoint,
  getDataPointsByGoal,
} from '../../services/dataPoint.service';
import { prisma } from '../setup';

describe('Complete Treatment Plan Workflow (E2E)', () => {
  it('should handle full patient treatment journey', async () => {
    // Step 1: Create practitioner and patient
    const practitioner = await createTestUser(Role.PRACTITIONER);
    const { patient, patientUser } = await createCompleteTestPatient(
      'Patient123!@#',
      practitioner.organizationId!
    );

    // Step 2: Create treatment plan
    const treatmentPlan = await createTreatmentPlan(
      {
        patientId: patient.id,
        title: 'ABA Therapy Treatment Plan - Comprehensive',
        description: 'Comprehensive ABA therapy plan focusing on communication and social skills',
        startDate: new Date(),
        targetEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
      },
      practitioner.user
    );

    expect(treatmentPlan.id).toBeDefined();
    expect(treatmentPlan.status).toBe(TreatmentPlanStatus.DRAFT);
    expect(treatmentPlan.patientId).toBe(patient.id);

    // Step 3: Create goals with baselines
    const communicationGoal = await createGoal(
      {
        treatmentPlanId: treatmentPlan.id,
        title: 'Increase Verbal Communication',
        description: 'Patient will increase verbal mands to request preferred items',
        goalType: GoalType.SHORT_TERM,
        domain: 'Communication',
        baseline: { value: 2, unit: 'mands per session' },
        targetCriteria: '10+ mands per session with 80% accuracy for 3 consecutive sessions',
        measurementMethod: 'Frequency count during structured teaching sessions',
      },
      practitioner.user
    );

    const socialGoal = await createGoal(
      {
        treatmentPlanId: treatmentPlan.id,
        title: 'Improve Social Interaction',
        description: 'Patient will initiate peer interactions during free play',
        goalType: GoalType.LONG_TERM,
        domain: 'Social Skills',
        baseline: { value: 0, unit: 'peer interactions per 15 min' },
        targetCriteria: '3+ initiations per 15-minute free play session',
        measurementMethod: 'Event recording during naturalistic observations',
      },
      practitioner.user
    );

    expect(communicationGoal.status).toBe(GoalStatus.ACTIVE);
    expect(socialGoal.status).toBe(GoalStatus.ACTIVE);

    // Verify goals are linked to treatment plan
    const goals = await getGoalsByTreatmentPlan(treatmentPlan.id, practitioner.user);
    expect(goals).toHaveLength(2);

    // Step 4: Create service code and authorization for billing
    const serviceCode = await createTestServiceCode({
      organizationId: practitioner.organizationId!,
    });

    const authorization = await createTestAuthorization({
      patientId: patient.id,
      organizationId: practitioner.organizationId!,
    });

    // Step 5: Create appointment and complete it (creates session)
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: practitioner.organizationId!,
        patientId: patient.id,
        practitionerId: practitioner.userId,
        serviceCodeId: serviceCode.id,
        authorizationId: authorization.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour later
        status: 'SCHEDULED',
      },
    });

    // Complete appointment (should auto-create session and progress note)
    const { session } = await completeAppointmentAndCreateSession(
      {
        appointmentId: appointment.id,
        narrative: 'Patient showed good engagement throughout session. Worked on verbal mands and peer play.',
      },
      practitioner.user
    );

    expect(session.id).toBeDefined();
    expect(session.status).toBe('COMPLETED');
    expect(session.appointmentId).toBe(appointment.id);

    // Step 6: Verify progress note was auto-created
    const progressNote = await getProgressNoteBySession(session.id, practitioner.user);
    expect(progressNote).toBeDefined();
    expect(progressNote.sessionId).toBe(session.id);
    expect(progressNote.narrative).toContain('Patient showed good engagement');

    // Step 7: Add data points to goals (simulating progress tracking)
    // Communication goal data points - showing improvement
    await createDataPoint(
      {
        goalId: communicationGoal.id,
        sessionId: session.id,
        value: 2,
        unit: 'mands',
        date: new Date(),
        notes: 'Baseline session',
      },
      practitioner.user
    );

    await createDataPoint(
      {
        goalId: communicationGoal.id,
        sessionId: session.id,
        value: 4,
        unit: 'mands',
        date: new Date(Date.now() + 15 * 60 * 1000),
        notes: 'Mid-session progress',
      },
      practitioner.user
    );

    await createDataPoint(
      {
        goalId: communicationGoal.id,
        sessionId: session.id,
        value: 7,
        unit: 'mands',
        date: new Date(Date.now() + 30 * 60 * 1000),
        notes: 'End of session - significant improvement',
      },
      practitioner.user
    );

    // Social goal data points
    await createDataPoint(
      {
        goalId: socialGoal.id,
        sessionId: session.id,
        value: 1,
        unit: 'peer interactions',
        date: new Date(),
        notes: 'One spontaneous interaction observed',
      },
      practitioner.user
    );

    // Step 8: Verify data points are linked correctly
    const commDataPoints = await getDataPointsByGoal(
      communicationGoal.id,
      practitioner.user,
      { page: 1, limit: 10 }
    );
    expect(commDataPoints.dataPoints).toHaveLength(3);
    expect(commDataPoints.pagination.total).toBe(3);

    const socialDataPoints = await getDataPointsByGoal(
      socialGoal.id,
      practitioner.user,
      { page: 1, limit: 10 }
    );
    expect(socialDataPoints.dataPoints).toHaveLength(1);

    // Step 9: Calculate progress for communication goal
    const progress = await calculateGoalProgress(communicationGoal.id, practitioner.user);
    expect(progress.goal.id).toBe(communicationGoal.id);
    expect(progress.progress.totalDataPoints).toBe(3);
    expect(progress.progress.firstValue).toBe(2);
    expect(progress.progress.latestValue).toBe(7);
    expect(progress.progress.trend).toBe('IMPROVING');
    expect(progress.progress.percentageChange).toBeGreaterThan(0);

    // Step 10: Verify patient can access their own data
    const patientTreatmentPlan = await getTreatmentPlanById(treatmentPlan.id, patientUser.user);
    expect(patientTreatmentPlan.id).toBe(treatmentPlan.id);

    const patientGoals = await getGoalsByTreatmentPlan(treatmentPlan.id, patientUser.user);
    expect(patientGoals).toHaveLength(2);

    const patientProgress = await calculateGoalProgress(communicationGoal.id, patientUser.user);
    expect(patientProgress.goal.id).toBe(communicationGoal.id);

    // Step 11: Verify session and progress note are accessible
    const patientSession = await getSessionById(session.id, patientUser.user);
    expect(patientSession.id).toBe(session.id);

    const patientProgressNote = await getProgressNoteBySession(session.id, patientUser.user);
    expect(patientProgressNote.sessionId).toBe(session.id);

    // Final verification: Complete workflow integrity
    expect(treatmentPlan.patientId).toBe(patient.id);
    expect(communicationGoal.treatmentPlanId).toBe(treatmentPlan.id);
    expect(session.patientId).toBe(patient.id);
    expect(progressNote.sessionId).toBe(session.id);
    expect(commDataPoints.dataPoints[0].goalId).toBe(communicationGoal.id);
  });

  it('should handle multiple sessions with cumulative progress tracking', async () => {
    // Setup
    const practitioner = await createTestUser(Role.PRACTITIONER);
    const { patient } = await createCompleteTestPatient(
      'Patient456!@#',
      practitioner.organizationId!
    );

    const treatmentPlan = await createTreatmentPlan(
      {
        patientId: patient.id,
        title: 'Multi-Session Progress Tracking',
        description: 'Testing cumulative progress across multiple sessions',
        startDate: new Date(),
        targetEndDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      practitioner.user
    );

    const goal = await createGoal(
      {
        treatmentPlanId: treatmentPlan.id,
        title: 'Maintain Eye Contact',
        description: 'Increase duration of eye contact during interactions',
        goalType: GoalType.SHORT_TERM,
        domain: 'Social Communication',
        baseline: { value: 1, unit: 'seconds' },
        targetCriteria: '5+ seconds of eye contact',
        measurementMethod: 'Duration recording',
      },
      practitioner.user
    );

    const serviceCode = await createTestServiceCode({
      organizationId: practitioner.organizationId!,
    });

    const authorization = await createTestAuthorization({
      patientId: patient.id,
      organizationId: practitioner.organizationId!,
    });

    // Simulate 3 therapy sessions with progressive improvement
    const sessions = [];
    const dataPointsValues = [
      [1, 2, 2], // Session 1: baseline
      [2, 3, 4], // Session 2: improvement
      [4, 5, 6], // Session 3: near target
    ];

    for (let i = 0; i < 3; i++) {
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: practitioner.organizationId!,
          patientId: patient.id,
          practitionerId: practitioner.userId,
          serviceCodeId: serviceCode.id,
          authorizationId: authorization.id,
          startTime: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + i * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          status: 'SCHEDULED',
        },
      });

      const { session } = await completeAppointmentAndCreateSession(
        {
          appointmentId: appointment.id,
          narrative: `Session ${i + 1}: Patient showing steady progress`,
        },
        practitioner.user
      );

      sessions.push(session);

      // Add data points for this session
      for (const value of dataPointsValues[i]) {
        await createDataPoint(
          {
            goalId: goal.id,
            sessionId: session.id,
            value,
            unit: 'seconds',
          },
          practitioner.user
        );
      }
    }

    // Verify all sessions created progress notes
    for (const session of sessions) {
      const progressNote = await getProgressNoteBySession(session.id, practitioner.user);
      expect(progressNote).toBeDefined();
      expect(progressNote.sessionId).toBe(session.id);
    }

    // Calculate cumulative progress
    const finalProgress = await calculateGoalProgress(goal.id, practitioner.user);
    expect(finalProgress.progress.totalDataPoints).toBe(9); // 3 sessions × 3 data points
    expect(finalProgress.progress.firstValue).toBe(1);
    expect(finalProgress.progress.latestValue).toBe(6);
    expect(finalProgress.progress.trend).toBe('IMPROVING');

    // Verify progress calculation shows improvement from baseline
    expect(finalProgress.progress.latestValue).toBeGreaterThan(goal.baseline.value);
  });
});
