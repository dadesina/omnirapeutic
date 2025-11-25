// Authentication API Endpoints
// Handles login, register, logout, and user profile requests

import { post, get } from './client';
import {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  Patient,
  Practitioner,
} from '../types/api';
import { setToken, clearToken } from '../auth/tokens';

/**
 * Login user
 */
export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  const response = await post<AuthResponse>('/api/auth/login', credentials);

  // Store token after successful login
  if (response.token) {
    setToken(response.token);
  }

  return response;
}

/**
 * Register new user
 */
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await post<AuthResponse>('/api/auth/register', data);

  // Store token after successful registration
  if (response.token) {
    setToken(response.token);
  }

  return response;
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  clearToken();
  // Optional: Call server logout endpoint if it exists
  // await post('/api/auth/logout');
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<{
  user: User;
  patient?: Patient;
  practitioner?: Practitioner;
}> {
  return await get<{
    user: User;
    patient?: Patient;
    practitioner?: Practitioner;
  }>('/api/auth/me');
}

/**
 * Refresh JWT token (if server supports it)
 * Note: Currently not implemented on backend, using 15-min expiry
 */
export async function refreshToken(): Promise<string> {
  const response = await post<{ token: string }>('/api/auth/refresh');

  if (response.token) {
    setToken(response.token);
  }

  return response.token;
}
