/**
 * Input Validation Utilities
 *
 * Provides validation functions for common input types
 * Used for authentication and user input sanitization
 */

/**
 * Validate email format using RFC 5322 standard
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

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

/**
 * Validate medical record number format
 * Alphanumeric, 6-20 characters
 */
export const validateMedicalRecordNumber = (mrn: string): boolean => {
  const mrnRegex = /^[A-Z0-9]{6,20}$/;
  return mrnRegex.test(mrn);
};

/**
 * Validate license number format
 * Alphanumeric with optional hyphens, 5-20 characters
 */
export const validateLicenseNumber = (license: string): boolean => {
  const licenseRegex = /^[A-Z0-9-]{5,20}$/;
  return licenseRegex.test(license);
};

/**
 * Validate phone number (E.164 format)
 * Optional, but if provided must be valid
 */
export const validatePhoneNumber = (phone: string): boolean => {
  if (!phone) return true; // Optional field
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

/**
 * Sanitize string input
 * Remove leading/trailing whitespace, limit length
 */
export const sanitizeString = (input: string, maxLength: number = 255): string => {
  return input.trim().substring(0, maxLength);
};
