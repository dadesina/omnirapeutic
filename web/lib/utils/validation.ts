// Validation Schemas for Omnirapeutic Healthcare Platform
// Uses Zod for runtime validation

import { z } from 'zod';

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Register form validation schema
 */
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  role: z.enum(['ADMIN', 'PRACTITIONER', 'PATIENT'], {
    message: 'Please select a role',
  }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  licenseNumber: z.string().optional(),
  specialization: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).refine(
  (data) => {
    // If role is PRACTITIONER, require firstName, lastName, licenseNumber, specialization
    if (data.role === 'PRACTITIONER') {
      return (
        data.firstName &&
        data.lastName &&
        data.licenseNumber &&
        data.specialization
      );
    }
    return true;
  },
  {
    message: 'All practitioner fields are required',
    path: ['firstName'],
  }
).refine(
  (data) => {
    // If role is PATIENT, require firstName, lastName, dateOfBirth
    if (data.role === 'PATIENT') {
      return data.firstName && data.lastName && data.dateOfBirth;
    }
    return true;
  },
  {
    message: 'All patient fields are required',
    path: ['firstName'],
  }
);

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Patient form validation schema
 */
export const patientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  medicalRecordNumber: z.string().min(1, 'Medical record number is required'),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
});

export type PatientFormData = z.infer<typeof patientSchema>;

/**
 * Practitioner form validation schema
 */
export const practitionerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  licenseNumber: z.string().min(1, 'License number is required'),
  specialization: z.string().min(1, 'Specialization is required'),
  phoneNumber: z.string().optional(),
});

export type PractitionerFormData = z.infer<typeof practitionerSchema>;
