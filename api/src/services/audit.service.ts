/**
 * Audit Service
 *
 * Centralized audit logging for HIPAA compliance
 * § 164.312(b) - Audit Controls
 * § 164.308(a)(1)(ii)(D) - Information System Activity Review
 *
 * Provides consistent audit logging across all services
 */

import prisma from '../config/database';

export interface AuditEventParams {
  userId: string | null;
  organizationId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Log an audit event to the database
 *
 * @param params - Audit event parameters
 * @returns Created audit log entry
 *
 * @example
 * await logAuditEvent({
 *   userId: 'user-uuid',
 *   organizationId: 'org-uuid',
 *   action: 'READ',
 *   resource: 'patients',
 *   resourceId: 'patient-uuid',
 *   details: { medicalRecordNumber: 'MRN123' },
 *   ipAddress: '192.168.1.1'
 * });
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId || null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId || null,
        details: params.details || undefined,
        ipAddress: params.ipAddress || 'unknown',
      },
    });
  } catch (error) {
    // Audit logging should never block the main operation
    // Log the error but don't throw
    console.error('Failed to create audit log:', error);
    console.error('Audit event details:', JSON.stringify(params, null, 2));
  }
}

/**
 * Batch log multiple audit events
 * Useful for operations that affect multiple resources
 *
 * @param events - Array of audit event parameters
 */
export async function logAuditEvents(events: AuditEventParams[]): Promise<void> {
  try {
    await prisma.auditLog.createMany({
      data: events.map((event) => ({
        userId: event.userId,
        organizationId: event.organizationId || null,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId || null,
        details: event.details || undefined,
        ipAddress: event.ipAddress || 'unknown',
      })),
    });
  } catch (error) {
    console.error('Failed to create batch audit logs:', error);
    console.error('Audit events details:', JSON.stringify(events, null, 2));
  }
}

/**
 * Common audit actions for consistency
 */
export const AUDIT_ACTIONS = {
  // CRUD operations
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',

  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILURE: 'LOGIN_FAILURE',

  // BTG (Break-the-Glass) operations
  BTG_GRANT_ACCESS: 'BTG_GRANT_ACCESS',
  BTG_GRANT_ACCESS_FAILURE: 'BTG_GRANT_ACCESS_FAILURE',
  BTG_REVOKE_ACCESS: 'BTG_REVOKE_ACCESS',
  BTG_USE_ACCESS: 'BTG_USE_ACCESS',

  // Authorization
  ACCESS_DENIED: 'ACCESS_DENIED',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
} as const;

/**
 * Common resource types for consistency
 */
export const AUDIT_RESOURCES = {
  USERS: 'users',
  PATIENTS: 'patients',
  PRACTITIONERS: 'practitioners',
  BTG_ACCESS_GRANTS: 'btg_access_grants',
  AUDIT_LOGS: 'audit_logs',
} as const;
