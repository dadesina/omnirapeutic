'use client';

// Custom Authentication Hooks
// Provides convenient hooks for authentication operations

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login as apiLogin, register as apiRegister } from '../api/auth';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types/api';
import { useAuthContext } from './context';

/**
 * Hook to access authentication state and methods
 */
export function useAuth() {
  return useAuthContext();
}

/**
 * Hook to access current user
 */
export function useUser() {
  const { user, patient, practitioner, isLoading } = useAuthContext();
  return { user, patient, practitioner, isLoading };
}

/**
 * Hook for login mutation
 */
export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: LoginRequest) => apiLogin(credentials),
    onSuccess: (data: AuthResponse) => {
      // Update the current user query cache
      queryClient.setQueryData(['currentUser'], {
        user: data.user,
        patient: data.patient,
        practitioner: data.practitioner,
      });

      // Redirect based on role
      const role = data.user.role;
      if (role === 'ADMIN') {
        router.push('/dashboard/admin');
      } else if (role === 'PRACTITIONER') {
        router.push('/dashboard/practitioner');
      } else if (role === 'PATIENT') {
        router.push('/dashboard/patient');
      }
    },
    onError: (error: any) => {
      console.error('Login failed:', error);
    },
  });
}

/**
 * Hook for register mutation
 */
export function useRegister() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterRequest) => apiRegister(data),
    onSuccess: (data: AuthResponse) => {
      // Update the current user query cache
      queryClient.setQueryData(['currentUser'], {
        user: data.user,
        patient: data.patient,
        practitioner: data.practitioner,
      });

      // Redirect based on role
      const role = data.user.role;
      if (role === 'ADMIN') {
        router.push('/dashboard/admin');
      } else if (role === 'PRACTITIONER') {
        router.push('/dashboard/practitioner');
      } else if (role === 'PATIENT') {
        router.push('/dashboard/patient');
      }
    },
    onError: (error: any) => {
      console.error('Registration failed:', error);
    },
  });
}

/**
 * Hook to check if user has specific role
 */
export function useHasRole(role: string | string[]) {
  const { user } = useAuthContext();
  if (!user) return false;

  if (Array.isArray(role)) {
    return role.includes(user.role);
  }

  return user.role === role;
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin() {
  return useHasRole('ADMIN');
}

/**
 * Hook to check if user is practitioner
 */
export function useIsPractitioner() {
  return useHasRole('PRACTITIONER');
}

/**
 * Hook to check if user is patient
 */
export function useIsPatient() {
  return useHasRole('PATIENT');
}
