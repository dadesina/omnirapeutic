'use client';

// Authentication Context Provider
// Manages global authentication state using React Query

import React, { createContext, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, logout as apiLogout } from '../api/auth';
import { User, Patient, Practitioner, Role } from '../types/api';
import { isAuthenticated, clearToken, shouldRefreshToken } from './tokens';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  patient: Patient | null;
  practitioner: Practitioner | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: Role | null;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Fetch current user if authenticated
  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
    enabled: isAuthenticated(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Set up auto-refresh check interval
  useEffect(() => {
    if (!isAuthenticated()) return;

    const interval = setInterval(() => {
      // Check if token needs refresh
      if (shouldRefreshToken()) {
        // Refetch user data which will use the token
        // In a real implementation, you'd call a refresh endpoint
        refetch();
      }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, [refetch]);

  // Logout function
  const logout = async () => {
    await apiLogout();
    queryClient.clear();
    router.push('/login');
  };

  const value: AuthContextType = {
    user: data?.user || null,
    patient: data?.patient || null,
    practitioner: data?.practitioner || null,
    isLoading,
    isAuthenticated: !!data?.user,
    role: data?.user?.role || null,
    logout,
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
