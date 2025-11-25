'use client';

// Providers Component
// Wraps React Query and Authentication providers

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/context';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  // Create a client instance per request
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
