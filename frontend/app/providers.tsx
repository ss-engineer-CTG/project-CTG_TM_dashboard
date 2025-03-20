'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ApiProvider } from './contexts/ApiContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Notification from './components/Notification';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * アプリケーションのプロバイダーコンポーネント
 * すべてのコンテキストプロバイダーとエラーバウンダリを管理します
 */
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

  // SSR/CSRの不一致を防ぐためのマウント状態管理
  const [isMounted, setIsMounted] = useState(false);

  // マウント後に状態を更新
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 初期レンダリング時はシンプルな表示をすることでSSR/CSRの不一致を防止
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="dashboard-card p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-700 rounded-full w-3/4 mx-auto"></div>
            <div className="h-4 bg-gray-700 rounded-full w-1/2 mx-auto"></div>
            <div className="h-10 bg-gray-700 rounded-full w-full"></div>
          </div>
        </div>
      </div>
    );
  }

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