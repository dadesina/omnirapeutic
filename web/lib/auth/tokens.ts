// JWT Token Management for Omnirapeutic Healthcare Platform
// Handles storage, retrieval, and refresh of JWT tokens

import Cookies from 'js-cookie';

const TOKEN_KEY = 'auth_token';
const TOKEN_EXPIRY_KEY = 'auth_token_expiry';

// Token expires in 15 minutes (900000ms)
const TOKEN_EXPIRY_MS = 15 * 60 * 1000;

// Auto-refresh at 12 minutes (720000ms) to avoid expiry
export const AUTO_REFRESH_THRESHOLD_MS = 12 * 60 * 1000;

/**
 * Store JWT token securely in cookie
 */
export function setToken(token: string): void {
  const expiryTime = Date.now() + TOKEN_EXPIRY_MS;

  // Store token in httpOnly-like cookie (best we can do client-side)
  Cookies.set(TOKEN_KEY, token, {
    expires: 1 / 96, // 15 minutes (1/96 of a day)
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  // Store expiry time separately for refresh logic
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * Get stored JWT token
 */
export function getToken(): string | null {
  return Cookies.get(TOKEN_KEY) || null;
}

/**
 * Get token expiry time
 */
export function getTokenExpiry(): number | null {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
}

/**
 * Check if token is expired
 */
export function isTokenExpired(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return true;
  return Date.now() >= expiry;
}

/**
 * Check if token needs refresh (approaching expiry)
 */
export function shouldRefreshToken(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return false;

  const timeUntilExpiry = expiry - Date.now();
  return timeUntilExpiry <= AUTO_REFRESH_THRESHOLD_MS && timeUntilExpiry > 0;
}

/**
 * Clear stored token
 */
export function clearToken(): void {
  Cookies.remove(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const token = getToken();
  return !!token && !isTokenExpired();
}
