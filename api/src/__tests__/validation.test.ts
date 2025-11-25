/**
 * Validation Utilities Tests
 *
 * Tests for input validation functions
 */

import {
  validateEmail,
  validatePassword,
  validateMedicalRecordNumber,
  validateLicenseNumber,
  validatePhoneNumber,
  sanitizeString
} from '../utils/validation';

describe('Validation Utilities', () => {
  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user @example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      const result = validatePassword('SecurePass123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject passwords shorter than 8 characters', () => {
      const result = validatePassword('Short1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject passwords without uppercase letters', () => {
      const result = validatePassword('lowercase123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject passwords without lowercase letters', () => {
      const result = validatePassword('UPPERCASE123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject passwords without numbers', () => {
      const result = validatePassword('NoNumbers!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject passwords without special characters', () => {
      const result = validatePassword('NoSpecial123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should return multiple errors for weak passwords', () => {
      const result = validatePassword('weak');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('validateMedicalRecordNumber', () => {
    it('should accept valid MRN formats', () => {
      expect(validateMedicalRecordNumber('MRN123456')).toBe(true);
      expect(validateMedicalRecordNumber('ABC123XYZ')).toBe(true);
      expect(validateMedicalRecordNumber('1234567890')).toBe(true);
    });

    it('should reject MRNs shorter than 6 characters', () => {
      expect(validateMedicalRecordNumber('MRN12')).toBe(false);
    });

    it('should reject MRNs longer than 20 characters', () => {
      expect(validateMedicalRecordNumber('MRN123456789012345678901')).toBe(false);
    });

    it('should reject MRNs with lowercase letters', () => {
      expect(validateMedicalRecordNumber('mrn123456')).toBe(false);
    });

    it('should reject MRNs with special characters', () => {
      expect(validateMedicalRecordNumber('MRN-123456')).toBe(false);
      expect(validateMedicalRecordNumber('MRN@123456')).toBe(false);
    });
  });

  describe('validateLicenseNumber', () => {
    it('should accept valid license number formats', () => {
      expect(validateLicenseNumber('LIC123')).toBe(true);
      expect(validateLicenseNumber('ABC-123-XYZ')).toBe(true);
      expect(validateLicenseNumber('12345')).toBe(true);
    });

    it('should reject license numbers shorter than 5 characters', () => {
      expect(validateLicenseNumber('LIC1')).toBe(false);
    });

    it('should reject license numbers longer than 20 characters', () => {
      expect(validateLicenseNumber('LIC123456789012345678901')).toBe(false);
    });

    it('should reject license numbers with lowercase letters', () => {
      expect(validateLicenseNumber('lic12345')).toBe(false);
    });

    it('should reject license numbers with invalid special characters', () => {
      expect(validateLicenseNumber('LIC@12345')).toBe(false);
      expect(validateLicenseNumber('LIC_12345')).toBe(false);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should accept valid E.164 phone numbers', () => {
      expect(validatePhoneNumber('+14155552671')).toBe(true);
      expect(validatePhoneNumber('+442071838750')).toBe(true);
      expect(validatePhoneNumber('+81312345678')).toBe(true);
    });

    it('should accept empty string (optional field)', () => {
      expect(validatePhoneNumber('')).toBe(true);
    });

    it('should reject phone numbers without + prefix', () => {
      expect(validatePhoneNumber('14155552671')).toBe(false);
    });

    it('should reject phone numbers with invalid format', () => {
      expect(validatePhoneNumber('+0155552671')).toBe(false); // Can't start with 0
      expect(validatePhoneNumber('+')).toBe(false);
      expect(validatePhoneNumber('+1 415 555 2671')).toBe(false); // No spaces
    });

    it('should reject phone numbers too short or too long', () => {
      expect(validatePhoneNumber('+1')).toBe(false); // Too short
      expect(validatePhoneNumber('+12345678901234567')).toBe(false); // Too long (>15 digits)
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace from strings', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
      expect(sanitizeString('\n\ttest\t\n')).toBe('test');
    });

    it('should limit string length to default 255 characters', () => {
      const longString = 'a'.repeat(300);
      const result = sanitizeString(longString);
      expect(result.length).toBe(255);
    });

    it('should limit string length to custom max length', () => {
      const longString = 'a'.repeat(100);
      const result = sanitizeString(longString, 50);
      expect(result.length).toBe(50);
    });

    it('should handle strings shorter than max length', () => {
      expect(sanitizeString('short')).toBe('short');
      expect(sanitizeString('test', 100)).toBe('test');
    });

    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString('   ')).toBe('');
    });
  });
});
