// API Response Types for Omnirapeutic Healthcare Platform

export type Role = 'ADMIN' | 'PRACTITIONER' | 'PATIENT';

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Patient {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  medicalRecordNumber: string;
  phoneNumber?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Practitioner {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialization: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  timestamp: string;
}

// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  licenseNumber?: string;
  specialization?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  patient?: Patient;
  practitioner?: Practitioner;
}

export interface RefreshTokenResponse {
  token: string;
}

// API Error Response
export interface ApiError {
  error: string;
  message: string;
  details?: any;
}

// Generic API Response wrapper
export interface ApiResponse<T> {
  data: T;
  message?: string;
}
