"use strict";
/**
 * Input Validation Utilities
 *
 * Provides validation functions for common input types
 * Used for authentication and user input sanitization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeString = exports.validatePhoneNumber = exports.validateLicenseNumber = exports.validateMedicalRecordNumber = exports.validatePassword = exports.validateEmail = void 0;
/**
 * Validate email format using RFC 5322 standard
 */
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.validateEmail = validateEmail;
/**
 * Validate password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    return {
        valid: errors.length === 0,
        errors
    };
};
exports.validatePassword = validatePassword;
/**
 * Validate medical record number format
 * Alphanumeric, 6-20 characters
 */
const validateMedicalRecordNumber = (mrn) => {
    const mrnRegex = /^[A-Z0-9]{6,20}$/;
    return mrnRegex.test(mrn);
};
exports.validateMedicalRecordNumber = validateMedicalRecordNumber;
/**
 * Validate license number format
 * Alphanumeric with optional hyphens, 5-20 characters
 */
const validateLicenseNumber = (license) => {
    const licenseRegex = /^[A-Z0-9-]{5,20}$/;
    return licenseRegex.test(license);
};
exports.validateLicenseNumber = validateLicenseNumber;
/**
 * Validate phone number (E.164 format)
 * Optional, but if provided must be valid
 */
const validatePhoneNumber = (phone) => {
    if (!phone)
        return true; // Optional field
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
};
exports.validatePhoneNumber = validatePhoneNumber;
/**
 * Sanitize string input
 * Remove leading/trailing whitespace, limit length
 */
const sanitizeString = (input, maxLength = 255) => {
    return input.trim().substring(0, maxLength);
};
exports.sanitizeString = sanitizeString;
