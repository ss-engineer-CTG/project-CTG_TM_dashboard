'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ApiProvider } from './contexts/ApiContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Notification from './components/Notification';
import ErrorBoundary from './components/ErrorBoundary';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('providers_init_start');
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        // キャッシュ時間の拡張
        staleTime: 1000 * 60 * 5, // 5分間
        cacheTime: 1000 * 60 * 30, // 30分間
      },
    },
  }));

  // パフォーマンス計測
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('providers_init_complete');
      window.performance.measure('providers_initialization', 'providers_init_start', 'providers_init_complete');
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <ErrorBoundary>
          <ApiProvider>
            {children}
          </ApiProvider>
        </ErrorBoundary>
        <Notification />
      </NotificationProvider>
    </QueryClientProvider>
  );
}