// Base HTTP Client for Omnirapeutic Healthcare Platform
// Handles all API communication with authentication and error handling

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getToken, clearToken, isTokenExpired } from '../auth/tokens';
import { ApiError } from '../types/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies
});

/**
 * Request interceptor - Add authentication token
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();

    // Check if token is expired
    if (token && isTokenExpired()) {
      clearToken();
      window.location.href = '/login?expired=true';
      return Promise.reject(new Error('Token expired'));
    }

    // Add authorization header if token exists
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handle errors and token refresh
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Clear token and redirect to login
      clearToken();
      window.location.href = '/login?expired=true';
      return Promise.reject(error);
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access denied:', error.response.data);
      return Promise.reject({
        ...error.response.data,
        message: error.response.data?.message || 'You do not have permission to access this resource',
      });
    }

    // Handle network errors
    if (!error.response) {
      return Promise.reject({
        message: 'Network error. Please check your connection.',
        error: 'NETWORK_ERROR',
      });
    }

    // Return error from server
    return Promise.reject(error.response.data);
  }
);

/**
 * Generic GET request
 */
export async function get<T>(url: string, config = {}): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

/**
 * Generic POST request
 */
export async function post<T>(url: string, data?: any, config = {}): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

/**
 * Generic PUT request
 */
export async function put<T>(url: string, data?: any, config = {}): Promise<T> {
  const response = await apiClient.put<T>(url, data, config);
  return response.data;
}

/**
 * Generic DELETE request
 */
export async function del<T>(url: string, config = {}): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}

/**
 * Generic PATCH request
 */
export async function patch<T>(url: string, data?: any, config = {}): Promise<T> {
  const response = await apiClient.patch<T>(url, data, config);
  return response.data;
}

export default apiClient;
