'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ApiProvider } from './contexts/ApiContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Notification from './components/Notification';

export function Providers({ children }: { children: React.ReactNode }) {
  // QueryClientをメモ化して再レンダリング時に再作成されないようにする
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <ApiProvider>
          {children}
        </ApiProvider>
        <Notification />
      </NotificationProvider>
    </QueryClientProvider>
  );
}