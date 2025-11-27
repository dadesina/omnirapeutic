/**
 * Analytics Service
 *
 * Provides analytics and reporting capabilities for treatment plans, goals,
 * patient progress, and organizational metrics.
 *
 * Phase 6 - Stage 1: Core Analytics Service
 * - Goal trend analysis
 * - Patient progress summaries
 * - Organization-level metrics
 *
 * Phase 6 - Stage 2: Operational Analytics
 * - Practitioner utilization tracking
 * - Patient session history
 * - Session completion rate analytics
 * - Appointment pattern analysis
 */

import { Role, Prisma, GoalStatus, TreatmentPlanStatus, SessionStatus, AppointmentStatus } from '@prisma/client';
import prisma from '../config/database';
import { JwtPayload } from './auth.service';
import { logAuditEvent } from './audit.service';
import { calculateGoalProgress, GoalProgressData } from './goal.service';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DateRangeFilter {
  startDate?: Date;
  endDate?: Date;
}

export interface GoalTrendData {
  goalId: string;
  goalTitle: string;
  domain: string;
  baseline: any;
  targetCriteria: string;
  progress: GoalProgressData['progress'];
  dataPointsByDate: Array<{
    date: Date;
    value: number;
    unit: string;
    sessionId?: string | null;
  }>;
}

export interface PatientProgressSummary {
  patientId: string;
  patientName: string;
  dateRange: DateRangeFilter;
  treatmentPlans: Array<{
    treatmentPlanId: string;
    title: string;
    status: string;
    goals: Array<{
      goalId: string;
      title: string;
      domain: string;
      status: string;
      progress: {
        totalDataPoints: number;
        latestValue: number;
        trend: string;
        percentageChange: number;
      };
    }>;
  }>;
  summary: {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    improvingGoals: number;
    decliningGoals: number;
    stableGoals: number;
    totalDataPoints: number;
    totalSessions: number;
  };
}

export interface OrganizationMetrics {
  organizationId: string;
  dateRange: DateRangeFilter;
  patientMetrics: {
    totalPatients: number;
    activePatientsWithSessions: number;
    patientsWithActiveTreatmentPlans: number;
  };
  treatmentPlanMetrics: {
    totalTreatmentPlans: number;
    activePlans: number;
    completedPlans: number;
    draftPlans: number;
  };
  goalMetrics: {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    improvingGoals: number;
    decliningGoals: number;
    stableGoals: number;
  };
  sessionMetrics: {
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    totalUnitsDelivered: number;
  };
  dataCollectionMetrics: {
    totalDataPoints: number;
    dataPointsThisWeek: number;
    dataPointsThisMonth: number;
    averageDataPointsPerSession: number;
  };
}

export interface PractitionerUtilization {
  practitionerId: string;
  practitionerName: string;
  dateRange: DateRangeFilter;
  metrics: {
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    totalHoursWorked: number;
    totalUnitsDelivered: number;
    uniquePatients: number;
    averageSessionDuration: number; // minutes
  };
  sessionsByDate: Array<{
    date: string; // YYYY-MM-DD
    sessionCount: number;
    hoursWorked: number;
  }>;
}

export interface PatientSessionHistory {
  patientId: string;
  patientName: string;
  dateRange: DateRangeFilter;
  sessions: Array<{
    sessionId: string;
    startTime: Date;
    endTime: Date | null;
    status: string;
    practitionerName: string;
    serviceCodeDescription: string;
    unitsUsed: number;
    narrative: string | null;
    hasProgressNote: boolean;
  }>;
  summary: {
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    totalUnitsDelivered: number;
    totalHoursLogged: number;
  };
}

export interface OrganizationPractitionerUtilization {
  organizationId: string;
  organizationName: string;
  dateRange: DateRangeFilter;
  practitioners: Array<{
    practitionerId: string;
    practitionerName: string;
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    totalHoursWorked: number;
    totalUnitsDelivered: number;
    uniquePatients: number;
    averageSessionDuration: number; // minutes
  }>;
  organizationTotals: {
    totalPractitioners: number;
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    totalHoursWorked: number;
    totalUnitsDelivered: number;
    totalUniquePatients: number;
  };
}

export interface SessionCompletionRate {
  organizationId: string;
  organizationName: string;
  dateRange: DateRangeFilter;
  overallMetrics: {
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    completionRate: number; // percentage
    cancellationRate: number; // percentage
  };
  trendByDate: Array<{
    date: string; // YYYY-MM-DD
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    completionRate: number; // percentage
  }>;
}

export interface AppointmentAnalytics {
  organizationId: string;
  organizationName: string;
  dateRange: DateRangeFilter;
  overallMetrics: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    scheduledAppointments: number;
    completionRate: number; // percentage
    noShowRate: number; // percentage
    averageLeadTime: number; // days between created and scheduled date
  };
  appointmentsByStatus: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  trendByDate: Array<{
    date: string; // YYYY-MM-DD
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
  }>;
}

export interface AuthorizationUtilization {
  patientId: string;
  patientName: string;
  authorizations: Array<{
    authorizationId: string;
    authNumber: string | null;
    serviceCodeDescription: string;
    totalUnits: number;
    usedUnits: number;
    scheduledUnits: number;
    remainingUnits: number;
    utilizationPercentage: number;
    startDate: Date;
    endDate: Date;
    daysRemaining: number;
    status: 'active' | 'expiring-soon' | 'expired' | 'depleted';
  }>;
  summary: {
    totalAuthorizations: number;
    activeAuthorizations: number;
    expiringSoonAuthorizations: number;
    expiredAuthorizations: number;
    depletedAuthorizations: number;
  };
}

/**
 * Expiring Authorizations Alert
 * List of authorizations expiring soon (within threshold days)
 * ADMIN and PRACTITIONER can view
 */
export interface ExpiringAuthorizationsAlert {
  organizationId: string;
  organizationName: string;
  thresholdDays: number;
  authorizations: Array<{
    authorizationId: string;
    authNumber: string | null;
    patientId: string;
    patientName: string;
    serviceCodeDescription: string;
    totalUnits: number;
    usedUnits: number;
    scheduledUnits: number;
    remainingUnits: number;
    utilizationPercentage: number;
    endDate: Date;
    daysRemaining: number;
    isHighUtilization: boolean;
  }>;
  summary: {
    totalExpiringAuthorizations: number;
    totalUnitsAtRisk: number;
    patientsAffected: number;
  };
}

/**
 * Organization Authorization Overview
 * Aggregate authorization statistics across the organization
 * ADMIN only
 */
export interface OrganizationAuthorizationOverview {
  organizationId: string;
  organizationName: string;
  summary: {
    totalAuthorizations: number;
    activeAuthorizations: number;
    expiringSoonAuthorizations: number;
    expiredAuthorizations: number;
    depletedAuthorizations: number;
    totalUnitsAuthorized: number;
    totalUnitsUsed: number;
    totalUnitsScheduled: number;
    totalUnitsRemaining: number;
    overallUtilizationPercentage: number;
  };
  byServiceCode: Array<{
    serviceCode: string;
    serviceCodeDescription: string;
    authorizationCount: number;
    totalUnits: number;
    usedUnits: number;
    scheduledUnits: number;
    remainingUnits: number;
    utilizationPercentage: number;
  }>;
  alertsRequired: {
    expiringSoonCount: number;
    depletedCount: number;
    highUtilizationCount: number; // > 80% utilized
  };
}

// ============================================================================
// Goal Trend Analysis
// ============================================================================

/**
 * Get detailed trend data for a specific goal
 * Wraps calculateGoalProgress with additional date filtering and data point details
 */
export async function getGoalTrendData(
  goalId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<GoalTrendData> {
  // Get base progress calculation (includes RBAC checks)
  const progressData = await calculateGoalProgress(goalId, user);

  // Get detailed data points with optional date filtering
  const where: Prisma.DataPointWhereInput = {
    goalId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    where.date = {};
    if (dateRange.startDate) {
      where.date.gte = dateRange.startDate;
    }
    if (dateRange.endDate) {
      where.date.lte = dateRange.endDate;
    }
  }

  const dataPoints = await prisma.dataPoint.findMany({
    where,
    orderBy: { date: 'asc' },
    select: {
      date: true,
      value: true,
      unit: true,
      sessionId: true,
    },
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_GOAL_TREND',
    resource: 'analytics',
    resourceId: goalId,
    organizationId: user.organizationId!,
    details: {
      goalId,
      dateRange,
      dataPointCount: dataPoints.length,
    },
  });

  return {
    goalId: progressData.goal.id,
    goalTitle: progressData.goal.title,
    domain: progressData.goal.domain,
    baseline: progressData.goal.baseline,
    targetCriteria: progressData.goal.targetCriteria,
    progress: progressData.progress,
    dataPointsByDate: dataPoints,
  };
}

// ============================================================================
// Patient Progress Summary
// ============================================================================

/**
 * Get comprehensive progress summary for a patient
 * Aggregates all treatment plans, goals, and progress data
 */
export async function getPatientProgressSummary(
  patientId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<PatientProgressSummary> {
  // Get patient with RBAC checks
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC checks
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isPractitioner = user.role === Role.PRACTITIONER;
  const isPatientOwner = patient.userId === user.userId;
  const isSameOrg = patient.organizationId === user.organizationId;

  // Super Admins can access any patient
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access patients in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isPatientOwner) {
      throw new Error('Forbidden: You can only view your own progress');
    }
  }

  // Get all treatment plans for patient
  const treatmentPlans = await prisma.treatmentPlan.findMany({
    where: { patientId },
    include: {
      goals: {
        include: {
          dataPoints: {
            where: dateRange.startDate || dateRange.endDate ? {
              date: {
                ...(dateRange.startDate && { gte: dateRange.startDate }),
                ...(dateRange.endDate && { lte: dateRange.endDate }),
              },
            } : undefined,
            orderBy: { date: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build progress data for each treatment plan and goal
  const treatmentPlanData = treatmentPlans.map((plan) => {
    const goalsData = plan.goals.map((goal) => {
      const dataPoints = goal.dataPoints;

      let progress = {
        totalDataPoints: 0,
        latestValue: 0,
        trend: 'NO_DATA',
        percentageChange: 0,
      };

      if (dataPoints.length > 0) {
        const firstValue = dataPoints[0].value;
        const latestValue = dataPoints[dataPoints.length - 1].value;
        const baselineValue = typeof goal.baseline === 'object' && goal.baseline !== null
          ? (goal.baseline as any).value || firstValue
          : firstValue;

        const percentageChange = baselineValue !== 0
          ? ((latestValue - baselineValue) / baselineValue) * 100
          : 0;

        // Determine trend
        let trend = 'STABLE';
        if (Math.abs(percentageChange) >= 10) {
          trend = percentageChange > 0 ? 'IMPROVING' : 'DECLINING';
        }

        progress = {
          totalDataPoints: dataPoints.length,
          latestValue,
          trend,
          percentageChange: Math.round(percentageChange * 100) / 100,
        };
      }

      return {
        goalId: goal.id,
        title: goal.title,
        domain: goal.domain,
        status: goal.status,
        progress,
      };
    });

    return {
      treatmentPlanId: plan.id,
      title: plan.title,
      status: plan.status,
      goals: goalsData,
    };
  });

  // Calculate summary statistics
  const allGoals = treatmentPlanData.flatMap((plan) => plan.goals);
  const summary = {
    totalGoals: allGoals.length,
    activeGoals: allGoals.filter((g) => g.status === GoalStatus.ACTIVE).length,
    completedGoals: allGoals.filter((g) => g.status === GoalStatus.MET).length,
    improvingGoals: allGoals.filter((g) => g.progress.trend === 'IMPROVING').length,
    decliningGoals: allGoals.filter((g) => g.progress.trend === 'DECLINING').length,
    stableGoals: allGoals.filter((g) => g.progress.trend === 'STABLE').length,
    totalDataPoints: allGoals.reduce((sum, g) => sum + g.progress.totalDataPoints, 0),
    totalSessions: 0, // Will be calculated separately
  };

  // Get session count for date range
  const sessionWhere: Prisma.SessionWhereInput = {
    patientId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    sessionWhere.startTime = {
      ...(dateRange.startDate && { gte: dateRange.startDate }),
      ...(dateRange.endDate && { lte: dateRange.endDate }),
    };
  }

  const sessionCount = await prisma.session.count({ where: sessionWhere });
  summary.totalSessions = sessionCount;

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_PATIENT_PROGRESS_SUMMARY',
    resource: 'analytics',
    resourceId: patientId,
    organizationId: user.organizationId!,
    details: {
      patientId,
      dateRange,
      totalGoals: summary.totalGoals,
      totalDataPoints: summary.totalDataPoints,
    },
  });

  return {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    dateRange,
    treatmentPlans: treatmentPlanData,
    summary,
  };
}

// ============================================================================
// Organization Metrics
// ============================================================================

/**
 * Get comprehensive metrics for an organization (ADMIN only)
 * Provides high-level statistics across all patients, plans, goals, and sessions
 */
export async function getOrganizationMetrics(
  organizationId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<OrganizationMetrics> {
  // RBAC: Only ADMIN or Super Admin can view organization metrics
  if (!user.isSuperAdmin && user.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only administrators can view organization metrics');
  }

  // Organization boundary check
  if (!user.isSuperAdmin && user.organizationId !== organizationId) {
    throw new Error('Forbidden: You can only view metrics for your organization');
  }

  const where: any = { organizationId };

  // Build date filter for time-based queries
  const dateFilter: any = {};
  if (dateRange.startDate || dateRange.endDate) {
    if (dateRange.startDate) {
      dateFilter.gte = dateRange.startDate;
    }
    if (dateRange.endDate) {
      dateFilter.lte = dateRange.endDate;
    }
  }

  // Patient Metrics
  const [
    totalPatients,
    patientsWithSessions,
    patientsWithActivePlans,
  ] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.count({
      where: {
        organizationId,
        sessions: {
          some: dateRange.startDate || dateRange.endDate ? {
            startTime: dateFilter,
          } : {},
        },
      },
    }),
    prisma.patient.count({
      where: {
        organizationId,
        treatmentPlans: {
          some: {
            status: TreatmentPlanStatus.ACTIVE,
          },
        },
      },
    }),
  ]);

  // Treatment Plan Metrics
  const [
    totalTreatmentPlans,
    activePlans,
    completedPlans,
    draftPlans,
  ] = await Promise.all([
    prisma.treatmentPlan.count({ where }),
    prisma.treatmentPlan.count({ where: { ...where, status: TreatmentPlanStatus.ACTIVE } }),
    prisma.treatmentPlan.count({ where: { ...where, status: TreatmentPlanStatus.COMPLETED } }),
    prisma.treatmentPlan.count({ where: { ...where, status: TreatmentPlanStatus.DRAFT } }),
  ]);

  // Goal Metrics
  const [
    totalGoals,
    activeGoals,
    completedGoals,
  ] = await Promise.all([
    prisma.goal.count({ where }),
    prisma.goal.count({ where: { ...where, status: GoalStatus.ACTIVE } }),
    prisma.goal.count({ where: { ...where, status: GoalStatus.MET } }),
  ]);

  // Calculate trend-based goal metrics (improving/declining/stable)
  // This requires analyzing data points, so we'll do a more complex query
  const goalsWithDataPoints = await prisma.goal.findMany({
    where,
    include: {
      dataPoints: {
        where: dateRange.startDate || dateRange.endDate ? {
          date: dateFilter,
        } : undefined,
        orderBy: { date: 'asc' },
        take: 100, // Limit for performance
      },
    },
  });

  let improvingGoals = 0;
  let decliningGoals = 0;
  let stableGoals = 0;

  goalsWithDataPoints.forEach((goal) => {
    if (goal.dataPoints.length >= 2) {
      const firstValue = goal.dataPoints[0].value;
      const latestValue = goal.dataPoints[goal.dataPoints.length - 1].value;
      const baselineValue = typeof goal.baseline === 'object' && goal.baseline !== null
        ? (goal.baseline as any).value || firstValue
        : firstValue;

      const percentageChange = baselineValue !== 0
        ? ((latestValue - baselineValue) / baselineValue) * 100
        : 0;

      if (Math.abs(percentageChange) >= 10) {
        if (percentageChange > 0) {
          improvingGoals++;
        } else {
          decliningGoals++;
        }
      } else {
        stableGoals++;
      }
    }
  });

  // Session Metrics
  const sessionWhere: any = { organizationId };
  if (dateRange.startDate || dateRange.endDate) {
    sessionWhere.startTime = dateFilter;
  }

  const [
    totalSessions,
    completedSessions,
    cancelledAppointments,
    unitsAggregation,
  ] = await Promise.all([
    prisma.session.count({ where: sessionWhere }),
    prisma.session.count({ where: { ...sessionWhere, status: SessionStatus.COMPLETED } }),
    prisma.appointment.count({
      where: {
        organizationId,
        status: AppointmentStatus.CANCELLED,
        ...(dateRange.startDate || dateRange.endDate ? {
          startTime: dateFilter,
        } : {}),
      },
    }),
    prisma.session.aggregate({
      where: sessionWhere,
      _sum: {
        unitsUsed: true,
      },
    }),
  ]);

  // Data Collection Metrics
  const dataPointWhere: any = { organizationId };
  if (dateRange.startDate || dateRange.endDate) {
    dataPointWhere.date = dateFilter;
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalDataPoints,
    dataPointsThisWeek,
    dataPointsThisMonth,
  ] = await Promise.all([
    prisma.dataPoint.count({ where: dataPointWhere }),
    prisma.dataPoint.count({
      where: {
        organizationId,
        date: { gte: oneWeekAgo },
      },
    }),
    prisma.dataPoint.count({
      where: {
        organizationId,
        date: { gte: oneMonthAgo },
      },
    }),
  ]);

  const averageDataPointsPerSession = totalSessions > 0
    ? Math.round((totalDataPoints / totalSessions) * 100) / 100
    : 0;

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_ORGANIZATION_METRICS',
    resource: 'analytics',
    resourceId: organizationId,
    organizationId: user.organizationId!,
    details: {
      organizationId,
      dateRange,
      totalPatients,
      totalGoals,
      totalSessions,
    },
  });

  return {
    organizationId,
    dateRange,
    patientMetrics: {
      totalPatients,
      activePatientsWithSessions: patientsWithSessions,
      patientsWithActiveTreatmentPlans: patientsWithActivePlans,
    },
    treatmentPlanMetrics: {
      totalTreatmentPlans,
      activePlans,
      completedPlans,
      draftPlans,
    },
    goalMetrics: {
      totalGoals,
      activeGoals,
      completedGoals,
      improvingGoals,
      decliningGoals,
      stableGoals,
    },
    sessionMetrics: {
      totalSessions,
      completedSessions,
      cancelledSessions: cancelledAppointments,
      totalUnitsDelivered: unitsAggregation._sum.unitsUsed || 0,
    },
    dataCollectionMetrics: {
      totalDataPoints,
      dataPointsThisWeek,
      dataPointsThisMonth,
      averageDataPointsPerSession,
    },
  };
}

// ============================================================================
// Practitioner Utilization
// ============================================================================

/**
 * Get utilization metrics for a specific practitioner
 * RBAC: ADMIN (all practitioners), PRACTITIONER (own only)
 */
export async function getPractitionerUtilization(
  practitionerId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<PractitionerUtilization> {
  // Get practitioner with RBAC checks
  const practitioner = await prisma.practitioner.findUnique({
    where: { id: practitionerId },
  });

  if (!practitioner) {
    throw new Error('Practitioner not found');
  }

  // RBAC checks
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isPractitionerOwner = practitioner.userId === user.userId;
  const isSameOrg = practitioner.organizationId === user.organizationId;

  // Super Admins can access any practitioner
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access practitioners in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitionerOwner) {
      throw new Error('Forbidden: You can only view your own utilization');
    }
  }

  // Build date filter
  const sessionWhere: Prisma.SessionWhereInput = {
    practitionerId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    sessionWhere.startTime = {
      ...(dateRange.startDate && { gte: dateRange.startDate }),
      ...(dateRange.endDate && { lte: dateRange.endDate }),
    };
  }

  // Get session metrics
  const [
    totalSessions,
    completedSessions,
    cancelledSessions,
    allSessions,
    unitsAggregation,
    uniquePatientsResult,
  ] = await Promise.all([
    prisma.session.count({ where: sessionWhere }),
    prisma.session.count({
      where: { ...sessionWhere, status: SessionStatus.COMPLETED },
    }),
    prisma.session.count({
      where: { ...sessionWhere, status: SessionStatus.CANCELLED },
    }),
    prisma.session.findMany({
      where: { ...sessionWhere, status: SessionStatus.COMPLETED },
      select: {
        startTime: true,
        endTime: true,
      },
    }),
    prisma.session.aggregate({
      where: { ...sessionWhere, status: SessionStatus.COMPLETED },
      _sum: {
        unitsUsed: true,
      },
    }),
    prisma.session.groupBy({
      by: ['patientId'],
      where: sessionWhere,
    }),
  ]);

  // Calculate total hours worked
  let totalMinutes = 0;
  allSessions.forEach((session) => {
    if (session.endTime) {
      const minutes =
        (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60);
      totalMinutes += minutes;
    }
  });

  const totalHoursWorked = Math.round((totalMinutes / 60) * 100) / 100;
  const averageSessionDuration =
    completedSessions > 0
      ? Math.round((totalMinutes / completedSessions) * 100) / 100
      : 0;

  // Group sessions by date
  const sessionsByDateMap = new Map<string, { count: number; minutes: number }>();

  allSessions.forEach((session) => {
    const dateKey = session.startTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const existing = sessionsByDateMap.get(dateKey) || { count: 0, minutes: 0 };

    let sessionMinutes = 0;
    if (session.endTime) {
      sessionMinutes =
        (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60);
    }

    sessionsByDateMap.set(dateKey, {
      count: existing.count + 1,
      minutes: existing.minutes + sessionMinutes,
    });
  });

  const sessionsByDate = Array.from(sessionsByDateMap.entries())
    .map(([date, data]) => ({
      date,
      sessionCount: data.count,
      hoursWorked: Math.round((data.minutes / 60) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_PRACTITIONER_UTILIZATION',
    resource: 'analytics',
    resourceId: practitionerId,
    organizationId: user.organizationId!,
    details: {
      practitionerId,
      dateRange,
      totalSessions,
    },
  });

  return {
    practitionerId: practitioner.id,
    practitionerName: `${practitioner.firstName} ${practitioner.lastName}`,
    dateRange,
    metrics: {
      totalSessions,
      completedSessions,
      cancelledSessions,
      totalHoursWorked,
      totalUnitsDelivered: unitsAggregation._sum.unitsUsed || 0,
      uniquePatients: uniquePatientsResult.length,
      averageSessionDuration,
    },
    sessionsByDate,
  };
}

// ============================================================================
// Patient Session History
// ============================================================================

/**
 * Get complete session history for a patient
 * RBAC: ADMIN, PRACTITIONER (all), PATIENT (own only)
 */
export async function getPatientSessionHistory(
  patientId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<PatientSessionHistory> {
  // Get patient with RBAC checks
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC checks
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isPractitioner = user.role === Role.PRACTITIONER;
  const isPatientOwner = patient.userId === user.userId;
  const isSameOrg = patient.organizationId === user.organizationId;

  // Super Admins can access any patient
  if (!isSuperAdmin) {
    // Organization boundary check
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access patients in your organization');
    }

    // Role-based checks within organization
    if (!isAdmin && !isPractitioner && !isPatientOwner) {
      throw new Error('Forbidden: You can only view your own session history');
    }
  }

  // Build session query with date filtering
  const sessionWhere: Prisma.SessionWhereInput = {
    patientId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    sessionWhere.startTime = {
      ...(dateRange.startDate && { gte: dateRange.startDate }),
      ...(dateRange.endDate && { lte: dateRange.endDate }),
    };
  }

  // Get all sessions with related data
  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    include: {
      practitioner: true,
      serviceCode: true,
      progressNote: {
        select: { id: true },
      },
    },
    orderBy: { startTime: 'desc' },
  });

  // Calculate summary statistics
  let totalHoursLogged = 0;
  let totalUnitsDelivered = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  const sessionData = sessions.map((session) => {
    // Calculate hours for this session
    if (session.endTime) {
      const hours = (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);
      totalHoursLogged += hours;
    }

    totalUnitsDelivered += session.unitsUsed;

    if (session.status === SessionStatus.COMPLETED) {
      completedCount++;
    } else if (session.status === SessionStatus.CANCELLED) {
      cancelledCount++;
    }

    return {
      sessionId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      practitionerName: `${session.practitioner.firstName} ${session.practitioner.lastName}`,
      serviceCodeDescription: session.serviceCode.description,
      unitsUsed: session.unitsUsed,
      narrative: session.narrative,
      hasProgressNote: !!session.progressNote,
    };
  });

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_PATIENT_SESSION_HISTORY',
    resource: 'analytics',
    resourceId: patientId,
    organizationId: user.organizationId!,
    details: {
      patientId,
      dateRange,
      sessionCount: sessions.length,
    },
  });

  return {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    dateRange,
    sessions: sessionData,
    summary: {
      totalSessions: sessions.length,
      completedSessions: completedCount,
      cancelledSessions: cancelledCount,
      totalUnitsDelivered,
      totalHoursLogged: Math.round(totalHoursLogged * 100) / 100,
    },
  };
}

// ============================================================================
// Organization Practitioner Utilization
// ============================================================================

/**
 * Get aggregate utilization metrics for all practitioners in an organization
 * ADMIN-only access for viewing organization-wide practitioner performance
 */
export async function getOrganizationPractitionerUtilization(
  organizationId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<OrganizationPractitionerUtilization> {
  // Get organization
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // RBAC checks - ADMIN only
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isSameOrg = organizationId === user.organizationId;

  // Super Admins can access any organization
  if (!isSuperAdmin) {
    // Must be in same organization
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access your own organization');
    }

    // Must be ADMIN
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can view organization-wide utilization');
    }
  }

  // Get all practitioners in organization
  const practitioners = await prisma.practitioner.findMany({
    where: { organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  // Build date filter for sessions
  const sessionDateFilter: Prisma.DateTimeFilter = {};
  if (dateRange.startDate) {
    sessionDateFilter.gte = dateRange.startDate;
  }
  if (dateRange.endDate) {
    sessionDateFilter.lte = dateRange.endDate;
  }

  // For each practitioner, get their utilization stats
  const practitionerStats = await Promise.all(
    practitioners.map(async (practitioner) => {
      const sessionWhere: Prisma.SessionWhereInput = {
        practitionerId: practitioner.id,
      };

      if (dateRange.startDate || dateRange.endDate) {
        sessionWhere.startTime = sessionDateFilter;
      }

      // Parallel queries for this practitioner
      const [
        totalSessions,
        completedSessions,
        cancelledSessions,
        completedSessionDetails,
        unitsAggregation,
        uniquePatientsResult,
      ] = await Promise.all([
        prisma.session.count({ where: sessionWhere }),
        prisma.session.count({
          where: { ...sessionWhere, status: SessionStatus.COMPLETED },
        }),
        prisma.session.count({
          where: { ...sessionWhere, status: SessionStatus.CANCELLED },
        }),
        prisma.session.findMany({
          where: { ...sessionWhere, status: SessionStatus.COMPLETED },
          select: { startTime: true, endTime: true },
        }),
        prisma.session.aggregate({
          where: { ...sessionWhere, status: SessionStatus.COMPLETED },
          _sum: { unitsUsed: true },
        }),
        prisma.session.groupBy({
          by: ['patientId'],
          where: sessionWhere,
        }),
      ]);

      // Calculate hours worked
      let totalMinutes = 0;
      completedSessionDetails.forEach((session) => {
        if (session.endTime) {
          const durationMs = session.endTime.getTime() - session.startTime.getTime();
          const minutes = Math.floor(durationMs / (1000 * 60));
          totalMinutes += minutes;
        }
      });

      const totalHoursWorked = Math.round((totalMinutes / 60) * 100) / 100;
      const averageSessionDuration =
        completedSessions > 0 ? Math.round(totalMinutes / completedSessions) : 0;

      return {
        practitionerId: practitioner.id,
        practitionerName: `${practitioner.firstName} ${practitioner.lastName}`,
        totalSessions,
        completedSessions,
        cancelledSessions,
        totalHoursWorked,
        totalUnitsDelivered: unitsAggregation._sum.unitsUsed || 0,
        uniquePatients: uniquePatientsResult.length,
        averageSessionDuration,
      };
    })
  );

  // Calculate organization totals
  const organizationTotals = {
    totalPractitioners: practitioners.length,
    totalSessions: practitionerStats.reduce((sum, p) => sum + p.totalSessions, 0),
    completedSessions: practitionerStats.reduce((sum, p) => sum + p.completedSessions, 0),
    cancelledSessions: practitionerStats.reduce((sum, p) => sum + p.cancelledSessions, 0),
    totalHoursWorked: Math.round(
      practitionerStats.reduce((sum, p) => sum + p.totalHoursWorked, 0) * 100
    ) / 100,
    totalUnitsDelivered: practitionerStats.reduce((sum, p) => sum + p.totalUnitsDelivered, 0),
    totalUniquePatients: 0, // Will calculate below
  };

  // Calculate total unique patients across all practitioners
  const sessionWhere: Prisma.SessionWhereInput = {
    practitionerId: { in: practitioners.map((p) => p.id) },
  };

  if (dateRange.startDate || dateRange.endDate) {
    sessionWhere.startTime = sessionDateFilter;
  }

  const uniquePatientsAcrossOrg = await prisma.session.groupBy({
    by: ['patientId'],
    where: sessionWhere,
  });

  organizationTotals.totalUniquePatients = uniquePatientsAcrossOrg.length;

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_ORGANIZATION_PRACTITIONER_UTILIZATION',
    resource: 'analytics',
    resourceId: organizationId,
    organizationId: user.organizationId!,
    details: {
      organizationId,
      dateRange,
      totalPractitioners: practitioners.length,
      totalSessions: organizationTotals.totalSessions,
    },
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    dateRange,
    practitioners: practitionerStats,
    organizationTotals,
  };
}

// ============================================================================
// Session Completion Rate
// ============================================================================

/**
 * Get session completion rate analytics for an organization
 * ADMIN-only access for tracking completion vs cancellation trends over time
 */
export async function getSessionCompletionRate(
  organizationId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<SessionCompletionRate> {
  // Get organization
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // RBAC checks - ADMIN only
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isSameOrg = organizationId === user.organizationId;

  // Super Admins can access any organization
  if (!isSuperAdmin) {
    // Must be in same organization
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access your own organization');
    }

    // Must be ADMIN
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can view completion rate analytics');
    }
  }

  // Build date filter for sessions
  const sessionWhere: Prisma.SessionWhereInput = {
    organizationId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    sessionWhere.startTime = {
      ...(dateRange.startDate && { gte: dateRange.startDate }),
      ...(dateRange.endDate && { lte: dateRange.endDate }),
    };
  }

  // Get overall counts
  const [totalSessions, completedSessions, cancelledSessions] = await Promise.all([
    prisma.session.count({ where: sessionWhere }),
    prisma.session.count({ where: { ...sessionWhere, status: SessionStatus.COMPLETED } }),
    prisma.session.count({ where: { ...sessionWhere, status: SessionStatus.CANCELLED } }),
  ]);

  // Calculate overall rates
  const completionRate =
    totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 10000) / 100 : 0;
  const cancellationRate =
    totalSessions > 0 ? Math.round((cancelledSessions / totalSessions) * 10000) / 100 : 0;

  // Get all sessions for date grouping
  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    select: {
      startTime: true,
      status: true,
    },
    orderBy: { startTime: 'asc' },
  });

  // Group by date
  const dateMap = new Map<
    string,
    {
      total: number;
      completed: number;
      cancelled: number;
    }
  >();

  sessions.forEach((session) => {
    const dateKey = session.startTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const existing = dateMap.get(dateKey) || { total: 0, completed: 0, cancelled: 0 };

    existing.total += 1;
    if (session.status === SessionStatus.COMPLETED) {
      existing.completed += 1;
    } else if (session.status === SessionStatus.CANCELLED) {
      existing.cancelled += 1;
    }

    dateMap.set(dateKey, existing);
  });

  // Convert map to array and calculate completion rates
  const trendByDate = Array.from(dateMap.entries())
    .map(([date, stats]) => ({
      date,
      totalSessions: stats.total,
      completedSessions: stats.completed,
      cancelledSessions: stats.cancelled,
      completionRate:
        stats.total > 0 ? Math.round((stats.completed / stats.total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_SESSION_COMPLETION_RATE',
    resource: 'analytics',
    resourceId: organizationId,
    organizationId: user.organizationId!,
    details: {
      organizationId,
      dateRange,
      totalSessions,
      completionRate,
    },
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    dateRange,
    overallMetrics: {
      totalSessions,
      completedSessions,
      cancelledSessions,
      completionRate,
      cancellationRate,
    },
    trendByDate,
  };
}

// ============================================================================
// Appointment Analytics
// ============================================================================

/**
 * Get appointment analytics for an organization
 * ADMIN-only access for tracking scheduling patterns, no-shows, and efficiency
 */
export async function getAppointmentAnalytics(
  organizationId: string,
  dateRange: DateRangeFilter,
  user: JwtPayload
): Promise<AppointmentAnalytics> {
  // Get organization
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // RBAC checks - ADMIN only
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isSameOrg = organizationId === user.organizationId;

  // Super Admins can access any organization
  if (!isSuperAdmin) {
    // Must be in same organization
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access your own organization');
    }

    // Must be ADMIN
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can view appointment analytics');
    }
  }

  // Build date filter for appointments
  const appointmentWhere: Prisma.AppointmentWhereInput = {
    organizationId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    appointmentWhere.startTime = {
      ...(dateRange.startDate && { gte: dateRange.startDate }),
      ...(dateRange.endDate && { lte: dateRange.endDate }),
    };
  }

  // Get counts by status
  const [
    totalAppointments,
    completedAppointments,
    cancelledAppointments,
    noShowAppointments,
    scheduledAppointments,
    allAppointments,
  ] = await Promise.all([
    prisma.appointment.count({ where: appointmentWhere }),
    prisma.appointment.count({ where: { ...appointmentWhere, status: 'COMPLETED' } }),
    prisma.appointment.count({ where: { ...appointmentWhere, status: 'CANCELLED' } }),
    prisma.appointment.count({ where: { ...appointmentWhere, status: 'NO_SHOW' } }),
    prisma.appointment.count({ where: { ...appointmentWhere, status: 'SCHEDULED' } }),
    prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        startTime: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  // Calculate overall metrics
  const completionRate =
    totalAppointments > 0
      ? Math.round((completedAppointments / totalAppointments) * 10000) / 100
      : 0;
  const noShowRate =
    totalAppointments > 0
      ? Math.round((noShowAppointments / totalAppointments) * 10000) / 100
      : 0;

  // Calculate average lead time (days between created and scheduled date)
  let totalLeadTimeDays = 0;
  let appointmentsWithLeadTime = 0;

  allAppointments.forEach((appointment) => {
    const createdDate = new Date(appointment.createdAt);
    const scheduledDate = new Date(appointment.startTime);
    const leadTimeDays = Math.floor(
      (scheduledDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (leadTimeDays >= 0) {
      totalLeadTimeDays += leadTimeDays;
      appointmentsWithLeadTime++;
    }
  });

  const averageLeadTime =
    appointmentsWithLeadTime > 0
      ? Math.round((totalLeadTimeDays / appointmentsWithLeadTime) * 100) / 100
      : 0;

  // Calculate appointments by status with percentages
  const appointmentsByStatus = [
    {
      status: 'SCHEDULED',
      count: scheduledAppointments,
      percentage:
        totalAppointments > 0
          ? Math.round((scheduledAppointments / totalAppointments) * 10000) / 100
          : 0,
    },
    {
      status: 'COMPLETED',
      count: completedAppointments,
      percentage:
        totalAppointments > 0
          ? Math.round((completedAppointments / totalAppointments) * 10000) / 100
          : 0,
    },
    {
      status: 'CANCELLED',
      count: cancelledAppointments,
      percentage:
        totalAppointments > 0
          ? Math.round((cancelledAppointments / totalAppointments) * 10000) / 100
          : 0,
    },
    {
      status: 'NO_SHOW',
      count: noShowAppointments,
      percentage:
        totalAppointments > 0
          ? Math.round((noShowAppointments / totalAppointments) * 10000) / 100
          : 0,
    },
  ];

  // Group by date
  const dateMap = new Map<
    string,
    {
      scheduled: number;
      completed: number;
      cancelled: number;
      noShow: number;
    }
  >();

  allAppointments.forEach((appointment) => {
    const dateKey = appointment.startTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const existing = dateMap.get(dateKey) || {
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
    };

    if (appointment.status === 'SCHEDULED') {
      existing.scheduled += 1;
    } else if (appointment.status === 'COMPLETED') {
      existing.completed += 1;
    } else if (appointment.status === 'CANCELLED') {
      existing.cancelled += 1;
    } else if (appointment.status === 'NO_SHOW') {
      existing.noShow += 1;
    }

    dateMap.set(dateKey, existing);
  });

  // Convert map to array
  const trendByDate = Array.from(dateMap.entries())
    .map(([date, stats]) => ({
      date,
      scheduled: stats.scheduled,
      completed: stats.completed,
      cancelled: stats.cancelled,
      noShow: stats.noShow,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_APPOINTMENT_ANALYTICS',
    resource: 'analytics',
    resourceId: organizationId,
    organizationId: user.organizationId!,
    details: {
      organizationId,
      dateRange,
      totalAppointments,
      noShowRate,
    },
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    dateRange,
    overallMetrics: {
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      scheduledAppointments,
      completionRate,
      noShowRate,
      averageLeadTime,
    },
    appointmentsByStatus,
    trendByDate,
  };
}

// ============================================================================
// Authorization Utilization
// ============================================================================

/**
 * Get authorization utilization for a specific patient
 * Shows how much of each authorization has been used/scheduled/remaining
 * ADMIN and PRACTITIONER can view, PATIENT can view own only
 */
export async function getAuthorizationUtilization(
  patientId: string,
  user: JwtPayload
): Promise<AuthorizationUtilization> {
  // Get patient
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // RBAC checks
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isPractitioner = user.role === Role.PRACTITIONER;
  const isPatientOwner = patient.userId === user.userId;
  const isSameOrg = patient.organizationId === user.organizationId;

  // Super Admins can access any patient
  if (!isSuperAdmin) {
    // Must be in same organization
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access patients in your organization');
    }

    // Must be ADMIN, PRACTITIONER, or the patient themselves
    if (!isAdmin && !isPractitioner && !isPatientOwner) {
      throw new Error('Forbidden: You do not have permission to view this authorization data');
    }
  }

  // Get all authorizations for the patient
  const authorizations = await prisma.authorization.findMany({
    where: { patientId },
    include: {
      serviceCode: {
        select: {
          code: true,
          description: true,
        },
      },
    },
    orderBy: { endDate: 'asc' },
  });

  const now = new Date();
  const EXPIRING_SOON_DAYS = 30; // Consider expiring soon if < 30 days remaining

  // Process each authorization
  const authorizationData = authorizations.map((auth) => {
    const remainingUnits = auth.totalUnits - auth.usedUnits - auth.scheduledUnits;
    const utilizationPercentage =
      auth.totalUnits > 0
        ? Math.round(((auth.usedUnits + auth.scheduledUnits) / auth.totalUnits) * 10000) / 100
        : 0;

    // Calculate days remaining
    const endDate = new Date(auth.endDate);
    const daysRemaining = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Determine status
    let status: 'active' | 'expiring-soon' | 'expired' | 'depleted';
    if (remainingUnits <= 0) {
      status = 'depleted';
    } else if (daysRemaining < 0) {
      status = 'expired';
    } else if (daysRemaining <= EXPIRING_SOON_DAYS) {
      status = 'expiring-soon';
    } else {
      status = 'active';
    }

    return {
      authorizationId: auth.id,
      authNumber: auth.authNumber,
      serviceCodeDescription: `${auth.serviceCode.code} - ${auth.serviceCode.description}`,
      totalUnits: auth.totalUnits,
      usedUnits: auth.usedUnits,
      scheduledUnits: auth.scheduledUnits,
      remainingUnits,
      utilizationPercentage,
      startDate: auth.startDate,
      endDate: auth.endDate,
      daysRemaining,
      status,
    };
  });

  // Calculate summary
  const summary = {
    totalAuthorizations: authorizations.length,
    activeAuthorizations: authorizationData.filter((a) => a.status === 'active').length,
    expiringSoonAuthorizations: authorizationData.filter((a) => a.status === 'expiring-soon')
      .length,
    expiredAuthorizations: authorizationData.filter((a) => a.status === 'expired').length,
    depletedAuthorizations: authorizationData.filter((a) => a.status === 'depleted').length,
  };

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_AUTHORIZATION_UTILIZATION',
    resource: 'analytics',
    resourceId: patientId,
    organizationId: user.organizationId!,
    details: {
      patientId,
      totalAuthorizations: authorizations.length,
    },
  });

  return {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    authorizations: authorizationData,
    summary,
  };
}

/**
 * Get organization-wide authorization overview
 * ADMIN only
 */
export async function getOrganizationAuthorizationOverview(
  organizationId: string,
  user: JwtPayload
): Promise<OrganizationAuthorizationOverview> {
  // Get organization
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // RBAC: ADMIN only (or super admin)
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isSameOrg = user.organizationId === organizationId;

  if (!isSuperAdmin) {
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access your own organization');
    }
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can view organization authorization overview');
    }
  }

  // Get all authorizations for the organization
  const authorizations = await prisma.authorization.findMany({
    where: { organizationId },
    include: {
      serviceCode: {
        select: {
          code: true,
          description: true,
        },
      },
    },
  });

  const now = new Date();
  const EXPIRING_SOON_DAYS = 30;
  const HIGH_UTILIZATION_THRESHOLD = 0.8; // 80%

  // Process each authorization to determine status
  const authorizationsWithStatus = authorizations.map((auth) => {
    const remainingUnits = auth.totalUnits - auth.usedUnits - auth.scheduledUnits;
    const utilizationPercentage =
      auth.totalUnits > 0
        ? (auth.usedUnits + auth.scheduledUnits) / auth.totalUnits
        : 0;

    const endDate = new Date(auth.endDate);
    const daysRemaining = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Determine status
    let status: 'active' | 'expiring-soon' | 'expired' | 'depleted';
    if (remainingUnits <= 0) {
      status = 'depleted';
    } else if (daysRemaining < 0) {
      status = 'expired';
    } else if (daysRemaining <= EXPIRING_SOON_DAYS) {
      status = 'expiring-soon';
    } else {
      status = 'active';
    }

    return {
      ...auth,
      remainingUnits,
      utilizationPercentage,
      status,
      isHighUtilization: utilizationPercentage >= HIGH_UTILIZATION_THRESHOLD,
    };
  });

  // Calculate overall summary
  const totalUnitsAuthorized = authorizationsWithStatus.reduce((sum, a) => sum + a.totalUnits, 0);
  const totalUnitsUsed = authorizationsWithStatus.reduce((sum, a) => sum + a.usedUnits, 0);
  const totalUnitsScheduled = authorizationsWithStatus.reduce((sum, a) => sum + a.scheduledUnits, 0);
  const totalUnitsRemaining = authorizationsWithStatus.reduce((sum, a) => sum + a.remainingUnits, 0);
  const overallUtilizationPercentage =
    totalUnitsAuthorized > 0
      ? Math.round(((totalUnitsUsed + totalUnitsScheduled) / totalUnitsAuthorized) * 10000) / 100
      : 0;

  const summary = {
    totalAuthorizations: authorizations.length,
    activeAuthorizations: authorizationsWithStatus.filter((a) => a.status === 'active').length,
    expiringSoonAuthorizations: authorizationsWithStatus.filter((a) => a.status === 'expiring-soon').length,
    expiredAuthorizations: authorizationsWithStatus.filter((a) => a.status === 'expired').length,
    depletedAuthorizations: authorizationsWithStatus.filter((a) => a.status === 'depleted').length,
    totalUnitsAuthorized,
    totalUnitsUsed,
    totalUnitsScheduled,
    totalUnitsRemaining,
    overallUtilizationPercentage,
  };

  // Group by service code
  const serviceCodeMap = new Map<string, {
    serviceCode: string;
    serviceCodeDescription: string;
    authorizationCount: number;
    totalUnits: number;
    usedUnits: number;
    scheduledUnits: number;
    remainingUnits: number;
  }>();

  authorizationsWithStatus.forEach((auth) => {
    const key = auth.serviceCode.code;
    const existing = serviceCodeMap.get(key);

    if (existing) {
      existing.authorizationCount += 1;
      existing.totalUnits += auth.totalUnits;
      existing.usedUnits += auth.usedUnits;
      existing.scheduledUnits += auth.scheduledUnits;
      existing.remainingUnits += auth.remainingUnits;
    } else {
      serviceCodeMap.set(key, {
        serviceCode: auth.serviceCode.code,
        serviceCodeDescription: `${auth.serviceCode.code} - ${auth.serviceCode.description}`,
        authorizationCount: 1,
        totalUnits: auth.totalUnits,
        usedUnits: auth.usedUnits,
        scheduledUnits: auth.scheduledUnits,
        remainingUnits: auth.remainingUnits,
      });
    }
  });

  const byServiceCode = Array.from(serviceCodeMap.values()).map((sc) => ({
    ...sc,
    utilizationPercentage:
      sc.totalUnits > 0
        ? Math.round(((sc.usedUnits + sc.scheduledUnits) / sc.totalUnits) * 10000) / 100
        : 0,
  }));

  // Calculate alerts
  const alertsRequired = {
    expiringSoonCount: authorizationsWithStatus.filter((a) => a.status === 'expiring-soon').length,
    depletedCount: authorizationsWithStatus.filter((a) => a.status === 'depleted').length,
    highUtilizationCount: authorizationsWithStatus.filter((a) => a.isHighUtilization).length,
  };

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_ORGANIZATION_AUTHORIZATION_OVERVIEW',
    resource: 'analytics',
    resourceId: organizationId,
    organizationId: user.organizationId!,
    details: {
      organizationId,
      totalAuthorizations: authorizations.length,
    },
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    summary,
    byServiceCode,
    alertsRequired,
  };
}

/**
 * Get expiring authorizations alert
 * ADMIN and PRACTITIONER can view
 */
export async function getExpiringAuthorizationsAlert(
  organizationId: string,
  thresholdDays: number,
  user: JwtPayload
): Promise<ExpiringAuthorizationsAlert> {
  // Get organization
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // RBAC: ADMIN and PRACTITIONER can view (or super admin)
  const isSuperAdmin = user.isSuperAdmin;
  const isAdmin = user.role === Role.ADMIN;
  const isPractitioner = user.role === Role.PRACTITIONER;
  const isSameOrg = user.organizationId === organizationId;

  if (!isSuperAdmin) {
    if (!isSameOrg) {
      throw new Error('Forbidden: You can only access your own organization');
    }
    if (!isAdmin && !isPractitioner) {
      throw new Error('Forbidden: Only administrators and practitioners can view expiring authorizations');
    }
  }

  // Calculate threshold date
  const now = new Date();
  const thresholdDate = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000);

  // Get authorizations expiring within threshold
  const expiringAuthorizations = await prisma.authorization.findMany({
    where: {
      organizationId,
      endDate: {
        gte: now,
        lte: thresholdDate,
      },
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      serviceCode: {
        select: {
          code: true,
          description: true,
        },
      },
    },
    orderBy: { endDate: 'asc' },
  });

  const HIGH_UTILIZATION_THRESHOLD = 0.8; // 80%

  // Process each authorization
  const authorizationData = expiringAuthorizations.map((auth) => {
    const remainingUnits = auth.totalUnits - auth.usedUnits - auth.scheduledUnits;
    const utilizationPercentage =
      auth.totalUnits > 0
        ? Math.round(((auth.usedUnits + auth.scheduledUnits) / auth.totalUnits) * 10000) / 100
        : 0;

    const endDate = new Date(auth.endDate);
    const daysRemaining = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      authorizationId: auth.id,
      authNumber: auth.authNumber,
      patientId: auth.patient.id,
      patientName: `${auth.patient.firstName} ${auth.patient.lastName}`,
      serviceCodeDescription: `${auth.serviceCode.code} - ${auth.serviceCode.description}`,
      totalUnits: auth.totalUnits,
      usedUnits: auth.usedUnits,
      scheduledUnits: auth.scheduledUnits,
      remainingUnits,
      utilizationPercentage,
      endDate: auth.endDate,
      daysRemaining,
      isHighUtilization: (auth.usedUnits + auth.scheduledUnits) / auth.totalUnits >= HIGH_UTILIZATION_THRESHOLD,
    };
  });

  // Calculate summary
  const uniquePatients = new Set(authorizationData.map((a) => a.patientId));
  const totalUnitsAtRisk = authorizationData.reduce((sum, a) => sum + a.remainingUnits, 0);

  const summary = {
    totalExpiringAuthorizations: authorizationData.length,
    totalUnitsAtRisk,
    patientsAffected: uniquePatients.size,
  };

  // Audit log
  await logAuditEvent({
    userId: user.userId,
    action: 'VIEW_EXPIRING_AUTHORIZATIONS_ALERT',
    resource: 'analytics',
    resourceId: organizationId,
    organizationId: user.organizationId!,
    details: {
      organizationId,
      thresholdDays,
      expiringCount: authorizationData.length,
    },
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    thresholdDays,
    authorizations: authorizationData,
    summary,
  };
}
