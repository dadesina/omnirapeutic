"use strict";
/**
 * Practitioner Service
 *
 * Handles all Practitioner-related business logic with RBAC enforcement
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPractitionerByUserId = exports.deletePractitioner = exports.updatePractitioner = exports.getPractitionerById = exports.getAllPractitioners = exports.createPractitioner = void 0;
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
/**
 * Create a new practitioner (Admin only)
 */
const createPractitioner = async (data, requestingUser) => {
    // RBAC: Only admins can create practitioners
    if (requestingUser.role !== client_1.Role.ADMIN) {
        throw new Error('Forbidden: Only administrators can create practitioners');
    }
    // Organization scoping: Regular admins can only create practitioners in their org
    if (!requestingUser.isSuperAdmin && data.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only create practitioners in your own organization');
    }
    // Validate that the user belongs to the same organization
    const user = await database_1.default.user.findUnique({
        where: { id: data.userId }
    });
    if (!user) {
        throw new Error('User not found');
    }
    if (user.organizationId !== data.organizationId) {
        throw new Error('User must belong to the same organization as the practitioner');
    }
    // Check for duplicate license number within the organization
    const existingPractitioner = await database_1.default.practitioner.findFirst({
        where: {
            organizationId: data.organizationId,
            licenseNumber: data.licenseNumber
        }
    });
    if (existingPractitioner) {
        throw new Error('License number already exists in this organization');
    }
    // Create practitioner
    const practitioner = await database_1.default.practitioner.create({
        data: {
            userId: data.userId,
            organizationId: data.organizationId,
            firstName: data.firstName,
            lastName: data.lastName,
            licenseNumber: data.licenseNumber,
            specialization: data.specialization,
            phoneNumber: data.phoneNumber,
            credentials: data.credentials || []
        }
    });
    return practitioner;
};
exports.createPractitioner = createPractitioner;
/**
 * Get all practitioners with pagination (Admin and Practitioner)
 */
const getAllPractitioners = async (requestingUser, filters = {}) => {
    // RBAC: Only admins and practitioners can view all practitioners
    if (requestingUser.role !== client_1.Role.ADMIN && requestingUser.role !== client_1.Role.PRACTITIONER) {
        throw new Error('Forbidden: Insufficient permissions');
    }
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    // Build where clause for search and filters
    const where = {};
    if (filters.search) {
        where.OR = [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { licenseNumber: { contains: filters.search, mode: 'insensitive' } }
        ];
    }
    if (filters.specialization) {
        where.specialization = { equals: filters.specialization, mode: 'insensitive' };
    }
    // Organization scoping: Super Admins see all orgs, regular users see only their org
    if (!requestingUser.isSuperAdmin) {
        where.organizationId = requestingUser.organizationId;
    }
    // Get practitioners with pagination
    const [practitioners, total] = await Promise.all([
        database_1.default.practitioner.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        }),
        database_1.default.practitioner.count({ where })
    ]);
    return {
        practitioners,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
};
exports.getAllPractitioners = getAllPractitioners;
/**
 * Get practitioner by ID with RBAC
 * - Super Admin: can view any practitioner in any organization
 * - Admin: can view practitioners in their organization
 * - Practitioner: can view practitioners in their organization (including own profile)
 * - Patient: can view practitioners in their organization (for finding care providers)
 */
const getPractitionerById = async (practitionerId, requestingUser) => {
    const practitioner = await database_1.default.practitioner.findUnique({
        where: { id: practitionerId }
    });
    if (!practitioner) {
        throw new Error('Practitioner not found');
    }
    // Super Admins can access any practitioner
    if (requestingUser.isSuperAdmin) {
        return practitioner;
    }
    // Organization boundary check: Users can only view practitioners in their org
    if (practitioner.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only view practitioners in your organization');
    }
    return practitioner;
};
exports.getPractitionerById = getPractitionerById;
/**
 * Update practitioner
 * - Super Admin: can update any practitioner in any organization
 * - Admin: can update practitioners in their organization
 * - Practitioner: can update own profile only
 */
const updatePractitioner = async (practitionerId, data, requestingUser) => {
    // Check if practitioner exists
    const existingPractitioner = await database_1.default.practitioner.findUnique({
        where: { id: practitionerId }
    });
    if (!existingPractitioner) {
        throw new Error('Practitioner not found');
    }
    // RBAC: Admins can update practitioners in their org, practitioners can update own profile
    const isSuperAdmin = requestingUser.isSuperAdmin;
    const isAdmin = requestingUser.role === client_1.Role.ADMIN;
    const isOwner = existingPractitioner.userId === requestingUser.userId;
    const isSameOrg = existingPractitioner.organizationId === requestingUser.organizationId;
    // Super Admins can update any practitioner
    if (!isSuperAdmin) {
        // Organization boundary check
        if (!isSameOrg) {
            throw new Error('Forbidden: You can only update practitioners in your organization');
        }
        // Role-based check within organization
        if (!isAdmin && !isOwner) {
            throw new Error('Forbidden: You can only update your own practitioner profile');
        }
    }
    // Update practitioner
    const updatedPractitioner = await database_1.default.practitioner.update({
        where: { id: practitionerId },
        data: {
            firstName: data.firstName,
            lastName: data.lastName,
            specialization: data.specialization,
            phoneNumber: data.phoneNumber
        }
    });
    return updatedPractitioner;
};
exports.updatePractitioner = updatePractitioner;
/**
 * Delete practitioner (Admin only)
 */
const deletePractitioner = async (practitionerId, requestingUser) => {
    // RBAC: Only admins can delete practitioners
    if (requestingUser.role !== client_1.Role.ADMIN) {
        throw new Error('Forbidden: Only administrators can delete practitioners');
    }
    // Check if practitioner exists
    const practitioner = await database_1.default.practitioner.findUnique({
        where: { id: practitionerId }
    });
    if (!practitioner) {
        throw new Error('Practitioner not found');
    }
    // Organization boundary check: Regular admins can only delete practitioners in their org
    if (!requestingUser.isSuperAdmin && practitioner.organizationId !== requestingUser.organizationId) {
        throw new Error('Forbidden: You can only delete practitioners in your organization');
    }
    // Delete practitioner
    await database_1.default.practitioner.delete({
        where: { id: practitionerId }
    });
};
exports.deletePractitioner = deletePractitioner;
/**
 * Get practitioner by user ID
 */
const getPractitionerByUserId = async (userId) => {
    return await database_1.default.practitioner.findUnique({
        where: { userId }
    });
};
exports.getPractitionerByUserId = getPractitionerByUserId;
