/**
 * Analytics Routes
 *
 * API endpoints for analytics and reporting
 *
 * Phase 6 - Stage 1: Core Analytics Endpoints
 * - GET /api/goals/:goalId/trend - Goal trend analysis
 * - GET /api/patients/:patientId/progress-summary - Patient progress summary
 * - GET /api/organizations/:orgId/metrics - Organization metrics
 *
 * Phase 6 - Stage 2: Operational Analytics Endpoints
 * - GET /api/practitioners/:practitionerId/utilization - Practitioner utilization
 * - GET /api/patients/:patientId/session-history - Patient session history
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  getGoalTrendData,
  getPatientProgressSummary,
  getOrganizationMetrics,
  getPractitionerUtilization,
  getPatientSessionHistory,
  getOrganizationPractitionerUtilization,
  getSessionCompletionRate,
  getAppointmentAnalytics,
  getAuthorizationUtilization,
  getOrganizationAuthorizationOverview,
  getExpiringAuthorizationsAlert,
  DateRangeFilter,
} from '../services/analytics.service';

const router = Router();

// ============================================================================
// Goal Trend Analysis
// ============================================================================

/**
 * GET /api/goals/:goalId/trend
 * Get detailed trend analysis for a specific goal
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: GoalTrendData
 */
router.get('/goals/:goalId/trend', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const { startDate, endDate } = req.query;

    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const trendData = await getGoalTrendData(goalId, dateRange, req.user!);

    return res.status(200).json(trendData);
  } catch (error: any) {
    console.error('Get goal trend error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve goal trend data' });
  }
});

// ============================================================================
// Patient Progress Summary
// ============================================================================

/**
 * GET /api/patients/:patientId/progress-summary
 * Get comprehensive progress summary for a patient
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: PatientProgressSummary
 */
router.get('/patients/:patientId/progress-summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { startDate, endDate } = req.query;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const progressSummary = await getPatientProgressSummary(
      patientId,
      dateRange,
      req.user!
    );

    return res.status(200).json(progressSummary);
  } catch (error: any) {
    console.error('Get patient progress summary error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve patient progress summary' });
  }
});

// ============================================================================
// Organization Metrics
// ============================================================================

/**
 * GET /api/organizations/:orgId/metrics
 * Get comprehensive metrics for an organization (ADMIN only)
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: OrganizationMetrics
 */
router.get('/organizations/:orgId/metrics', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const metrics = await getOrganizationMetrics(orgId, dateRange, req.user!);

    return res.status(200).json(metrics);
  } catch (error: any) {
    console.error('Get organization metrics error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve organization metrics' });
  }
});

// ============================================================================
// Practitioner Utilization
// ============================================================================

/**
 * GET /api/practitioners/:practitionerId/utilization
 * Get utilization metrics for a specific practitioner
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: PractitionerUtilization
 */
router.get('/practitioners/:practitionerId/utilization', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { practitionerId } = req.params;
    const { startDate, endDate } = req.query;

    if (!practitionerId) {
      return res.status(400).json({ error: 'Practitioner ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const utilization = await getPractitionerUtilization(
      practitionerId,
      dateRange,
      req.user!
    );

    return res.status(200).json(utilization);
  } catch (error: any) {
    console.error('Get practitioner utilization error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve practitioner utilization' });
  }
});

// ============================================================================
// Patient Session History
// ============================================================================

/**
 * GET /api/patients/:patientId/session-history
 * Get complete session history timeline for a patient
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: PatientSessionHistory
 */
router.get('/patients/:patientId/session-history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { startDate, endDate } = req.query;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const history = await getPatientSessionHistory(
      patientId,
      dateRange,
      req.user!
    );

    return res.status(200).json(history);
  } catch (error: any) {
    console.error('Get patient session history error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve patient session history' });
  }
});

// ============================================================================
// Organization Practitioner Utilization
// ============================================================================

/**
 * GET /api/organizations/:orgId/practitioner-utilization
 * Get aggregate practitioner utilization for an organization (ADMIN only)
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: OrganizationPractitionerUtilization
 */
router.get('/organizations/:orgId/practitioner-utilization', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const utilization = await getOrganizationPractitionerUtilization(
      orgId,
      dateRange,
      req.user!
    );

    return res.status(200).json(utilization);
  } catch (error: any) {
    console.error('Get organization practitioner utilization error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve organization practitioner utilization' });
  }
});

// ============================================================================
// Session Completion Rate
// ============================================================================

/**
 * GET /api/organizations/:orgId/completion-rate
 * Get session completion rate analytics for an organization (ADMIN only)
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: SessionCompletionRate
 */
router.get('/organizations/:orgId/completion-rate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const completionRate = await getSessionCompletionRate(
      orgId,
      dateRange,
      req.user!
    );

    return res.status(200).json(completionRate);
  } catch (error: any) {
    console.error('Get session completion rate error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve session completion rate' });
  }
});

// ============================================================================
// Appointment Analytics
// ============================================================================

/**
 * GET /api/organizations/:orgId/appointment-analytics
 * Get appointment analytics for an organization (ADMIN only)
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response: AppointmentAnalytics
 */
router.get('/organizations/:orgId/appointment-analytics', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const dateRange: DateRangeFilter = {};

    if (startDate) {
      const parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      dateRange.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      dateRange.endDate = parsedEndDate;
    }

    const analytics = await getAppointmentAnalytics(
      orgId,
      dateRange,
      req.user!
    );

    return res.status(200).json(analytics);
  } catch (error: any) {
    console.error('Get appointment analytics error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve appointment analytics' });
  }
});

// ============================================================================
// Authorization Utilization
// ============================================================================

/**
 * GET /api/patients/:patientId/authorization-utilization
 * Get authorization utilization for a specific patient
 *
 * Response: AuthorizationUtilization
 */
router.get('/patients/:patientId/authorization-utilization', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const utilization = await getAuthorizationUtilization(patientId, req.user!);

    return res.status(200).json(utilization);
  } catch (error: any) {
    console.error('Get authorization utilization error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve authorization utilization' });
  }
});

// ============================================================================
// Organization Authorization Overview
// ============================================================================

/**
 * GET /api/organizations/:orgId/authorization-overview
 * Get organization-wide authorization overview (ADMIN only)
 *
 * Response: OrganizationAuthorizationOverview
 */
router.get('/organizations/:orgId/authorization-overview', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const overview = await getOrganizationAuthorizationOverview(orgId, req.user!);

    return res.status(200).json(overview);
  } catch (error: any) {
    console.error('Get organization authorization overview error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve organization authorization overview' });
  }
});

// ============================================================================
// Expiring Authorizations Alert
// ============================================================================

/**
 * GET /api/organizations/:orgId/expiring-authorizations
 * Get expiring authorizations alert for an organization (ADMIN and PRACTITIONER)
 *
 * Query params:
 * - thresholdDays: Number of days (optional, defaults to 30)
 *
 * Response: ExpiringAuthorizationsAlert
 */
router.get('/organizations/:orgId/expiring-authorizations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { thresholdDays } = req.query;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const threshold = thresholdDays ? parseInt(thresholdDays as string, 10) : 30;

    if (isNaN(threshold) || threshold <= 0) {
      return res.status(400).json({ error: 'Threshold days must be a positive number' });
    }

    const alert = await getExpiringAuthorizationsAlert(orgId, threshold, req.user!);

    return res.status(200).json(alert);
  } catch (error: any) {
    console.error('Get expiring authorizations alert error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to retrieve expiring authorizations alert' });
  }
});

export default router;
