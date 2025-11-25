"use strict";
/**
 * Patient Service
 *
 * Handles all Patient-related business logic with RBAC enforcement
 * All PHI access is logged for HIPAA compliance
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatientByUserId = exports.deletePatient = exports.updatePatient = exports.getPatientById = exports.getAllPatients = exports.createPatient = void 0;
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
/**
 * Create a new patient (Admin only)
 */
const createPatient = async (data, requestingUser) => {
    // RBAC: Only admins can create patients
    if (requestingUser.role !== client_1.Role.ADMIN) {
        throw new Error('Forbidden: Only administrators can create patients');
    }
    // Validate date of birth is in the past
    if (new Date(data.dateOfBirth) > new Date()) {
        throw new Error('Date of birth must be in the past');
    }
    // Create patient
    const patient = await database_1.default.patient.create({
        data: {
            userId: data.userId,
            firstName: data.firstName,
            lastName: data.lastName,
            dateOfBirth: new Date(data.dateOfBirth),
            medicalRecordNumber: data.medicalRecordNumber,
            phoneNumber: data.phoneNumber,
            address: data.address
        }
    });
    return patient;
};
exports.createPatient = createPatient;
/**
 * Get all patients with pagination (Admin and Practitioner)
 */
const getAllPatients = async (requestingUser, filters = {}) => {
    // RBAC: Only admins and practitioners can view all patients
    if (requestingUser.role !== client_1.Role.ADMIN && requestingUser.role !== client_1.Role.PRACTITIONER) {
        throw new Error('Forbidden: Insufficient permissions');
    }
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    // Build where clause for search
    const where = filters.search
        ? {
            OR: [
                { firstName: { contains: filters.search, mode: 'insensitive' } },
                { lastName: { contains: filters.search, mode: 'insensitive' } },
                { medicalRecordNumber: { contains: filters.search, mode: 'insensitive' } }
            ]
        }
        : {};
    // Get patients with pagination
    const [patients, total] = await Promise.all([
        database_1.default.patient.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        }),
        database_1.default.patient.count({ where })
    ]);
    return {
        patients,
        total,
        page,
        limit
    };
};
exports.getAllPatients = getAllPatients;
/**
 * Get patient by ID with RBAC
 * - Admin: can view any patient
 * - Practitioner: can view any patient
 * - Patient: can only view own record
 */
const getPatientById = async (patientId, requestingUser) => {
    const patient = await database_1.default.patient.findUnique({
        where: { id: patientId }
    });
    if (!patient) {
        throw new Error('Patient not found');
    }
    // RBAC: Check permissions
    const isAdmin = requestingUser.role === client_1.Role.ADMIN;
    const isPractitioner = requestingUser.role === client_1.Role.PRACTITIONER;
    const isOwner = patient.userId === requestingUser.userId;
    if (!isAdmin && !isPractitioner && !isOwner) {
        throw new Error('Forbidden: You can only view your own patient record');
    }
    return patient;
};
exports.getPatientById = getPatientById;
/**
 * Update patient (Admin only)
 */
const updatePatient = async (patientId, data, requestingUser) => {
    // RBAC: Only admins can update patients
    if (requestingUser.role !== client_1.Role.ADMIN) {
        throw new Error('Forbidden: Only administrators can update patients');
    }
    // Check if patient exists
    const existingPatient = await database_1.default.patient.findUnique({
        where: { id: patientId }
    });
    if (!existingPatient) {
        throw new Error('Patient not found');
    }
    // Validate date of birth if provided
    if (data.dateOfBirth && new Date(data.dateOfBirth) > new Date()) {
        throw new Error('Date of birth must be in the past');
    }
    // Update patient
    const updatedPatient = await database_1.default.patient.update({
        where: { id: patientId },
        data: {
            firstName: data.firstName,
            lastName: data.lastName,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
            phoneNumber: data.phoneNumber,
            address: data.address
        }
    });
    return updatedPatient;
};
exports.updatePatient = updatePatient;
/**
 * Delete patient (Admin only)
 */
const deletePatient = async (patientId, requestingUser) => {
    // RBAC: Only admins can delete patients
    if (requestingUser.role !== client_1.Role.ADMIN) {
        throw new Error('Forbidden: Only administrators can delete patients');
    }
    // Check if patient exists
    const patient = await database_1.default.patient.findUnique({
        where: { id: patientId }
    });
    if (!patient) {
        throw new Error('Patient not found');
    }
    // Delete patient (cascade will handle user deletion if configured)
    await database_1.default.patient.delete({
        where: { id: patientId }
    });
};
exports.deletePatient = deletePatient;
/**
 * Get patient by user ID
 * Used to check if a user already has a patient profile
 */
const getPatientByUserId = async (userId) => {
    return await database_1.default.patient.findUnique({
        where: { userId }
    });
};
exports.getPatientByUserId = getPatientByUserId;
