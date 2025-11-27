"use strict";
/**
 * Practitioner Routes
 *
 * CRUD endpoints for Practitioner management with RBAC and audit logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const practitioner_service_1 = require("../services/practitioner.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const organization_scope_middleware_1 = require("../middleware/organization-scope.middleware");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
// All routes require authentication and organization scoping
router.use(auth_middleware_1.authenticateToken);
router.use(organization_scope_middleware_1.organizationScope);
/**
 * POST /api/practitioners
 * Create a new practitioner (Admin only)
 */
router.post('/', (0, auth_middleware_1.requireRole)([client_1.Role.ADMIN]), async (req, res) => {
    try {
        const { userId, firstName, lastName, licenseNumber, specialization, phoneNumber, credentials } = req.body;
        // Validate required fields
        if (!userId || !firstName || !lastName || !licenseNumber || !specialization) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'userId, firstName, lastName, licenseNumber, and specialization are required'
            });
            return;
        }
        // Extract organizationId: Super Admins must provide it, regular admins use their own
        const organizationId = req.user.isSuperAdmin
            ? req.body.organizationId
            : req.user.organizationId;
        // Validate Super Admin provides explicit organizationId
        if (req.user.isSuperAdmin && !req.body.organizationId) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Super Admins must provide organizationId in request body'
            });
            return;
        }
        // Create practitioner
        const practitioner = await (0, practitioner_service_1.createPractitioner)({
            userId,
            organizationId,
            firstName,
            lastName,
            licenseNumber,
            specialization,
            phoneNumber,
            credentials
        }, req.user);
        // Audit log with organization context
        await (0, audit_service_1.logAuditEvent)({
            userId: req.user.userId,
            organizationId: practitioner.organizationId,
            action: 'CREATE',
            resource: 'practitioners',
            resourceId: practitioner.id,
            details: { practitionerId: practitioner.id, licenseNumber: practitioner.licenseNumber },
            ipAddress: req.ip || '127.0.0.1'
        });
        res.status(201).json({ practitioner });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create practitioner';
        if (message.includes('Forbidden')) {
            res.status(403).json({ error: 'Forbidden', message });
            return;
        }
        if (message.includes('already exists') || message.includes('Unique constraint')) {
            res.status(409).json({
                error: 'Conflict',
                message: 'License number already exists in this organization'
            });
            return;
        }
        console.error('Create practitioner error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create practitioner'
        });
    }
});
/**
 * GET /api/practitioners
 * Get all practitioners with pagination (Admin and Practitioner)
 */
router.get('/', (0, auth_middleware_1.requireRole)([client_1.Role.ADMIN, client_1.Role.PRACTITIONER]), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search;
        const specialization = req.query.specialization;
        const result = await (0, practitioner_service_1.getAllPractitioners)(req.user, { page, limit, search, specialization });
        // Audit log with organization context
        await (0, audit_service_1.logAuditEvent)({
            userId: req.user.userId,
            organizationId: req.user.organizationId,
            action: 'READ',
            resource: 'practitioners',
            resourceId: null,
            details: { action: 'list', page, limit, count: result.practitioners.length },
            ipAddress: req.ip || '127.0.0.1'
        });
        res.status(200).json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get practitioners';
        if (message.includes('Forbidden')) {
            res.status(403).json({ error: 'Forbidden', message });
            return;
        }
        console.error('Get practitioners error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get practitioners'
        });
    }
});
/**
 * GET /api/practitioners/:id
 * Get practitioner by ID (All authenticated users)
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const practitioner = await (0, practitioner_service_1.getPractitionerById)(id, req.user);
        // Audit log with organization context
        await (0, audit_service_1.logAuditEvent)({
            userId: req.user.userId,
            organizationId: practitioner.organizationId,
            action: 'READ',
            resource: 'practitioners',
            resourceId: id,
            details: { practitionerId: id, licenseNumber: practitioner.licenseNumber },
            ipAddress: req.ip || '127.0.0.1'
        });
        res.status(200).json({ practitioner });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get practitioner';
        if (message.includes('not found')) {
            res.status(404).json({ error: 'Not Found', message: 'Practitioner not found' });
            return;
        }
        console.error('Get practitioner error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get practitioner'
        });
    }
});
/**
 * PUT /api/practitioners/:id
 * Update practitioner (Admin or Own Profile)
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, specialization, phoneNumber } = req.body;
        const practitioner = await (0, practitioner_service_1.updatePractitioner)(id, { firstName, lastName, specialization, phoneNumber }, req.user);
        // Audit log with organization context
        await (0, audit_service_1.logAuditEvent)({
            userId: req.user.userId,
            organizationId: practitioner.organizationId,
            action: 'UPDATE',
            resource: 'practitioners',
            resourceId: id,
            details: {
                practitionerId: id,
                changes: { firstName, lastName, specialization, phoneNumber }
            },
            ipAddress: req.ip || '127.0.0.1'
        });
        res.status(200).json({ practitioner });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update practitioner';
        if (message.includes('not found')) {
            res.status(404).json({ error: 'Not Found', message: 'Practitioner not found' });
            return;
        }
        if (message.includes('Forbidden')) {
            res.status(403).json({ error: 'Forbidden', message });
            return;
        }
        console.error('Update practitioner error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update practitioner'
        });
    }
});
/**
 * DELETE /api/practitioners/:id
 * Delete practitioner (Admin only)
 */
router.delete('/:id', (0, auth_middleware_1.requireRole)([client_1.Role.ADMIN]), async (req, res) => {
    try {
        const { id } = req.params;
        // Get practitioner first to capture organizationId before deletion
        const practitioner = await (0, practitioner_service_1.getPractitionerById)(id, req.user);
        await (0, practitioner_service_1.deletePractitioner)(id, req.user);
        // Audit log with organization context
        await (0, audit_service_1.logAuditEvent)({
            userId: req.user.userId,
            organizationId: practitioner.organizationId,
            action: 'DELETE',
            resource: 'practitioners',
            resourceId: id,
            details: { practitionerId: id },
            ipAddress: req.ip || '127.0.0.1'
        });
        res.status(204).send();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete practitioner';
        if (message.includes('not found')) {
            res.status(404).json({ error: 'Not Found', message: 'Practitioner not found' });
            return;
        }
        if (message.includes('Forbidden')) {
            res.status(403).json({ error: 'Forbidden', message });
            return;
        }
        console.error('Delete practitioner error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete practitioner'
        });
    }
});
exports.default = router;
