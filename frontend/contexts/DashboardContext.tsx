'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { ProjectData, DashboardSummary, ChartData } from '@/types/dashboard';

interface DashboardContextType {
  selectedFilePath: string;
  setSelectedFilePath: (path: string) => void;
  dashboardData: {
    summary: DashboardSummary | null;
    projects: ProjectData[];
    charts: {
      progressDistribution: ChartData | null;
      durationDistribution: ChartData | null;
    };
  };
  isLoading: boolean;
  error: Error | null;
  refreshData: () => void;
  notification: {
    show: boolean;
    message: string;
    type: 'success' | 'error';
  };
  showNotification: (message: string, type: 'success' | 'error') => void;
  hideNotification: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success' as const,
  });

  // 初期ロード時にサーバーからデフォルトパスを取得
  useEffect(() => {
    async function fetchDefaultPath() {
      try {
        const response = await fetch('http://localhost:8000/api/dashboard-file');
        const data = await response.json();
        if (data.path) {
          setSelectedFilePath(data.path);
        }
      } catch (error) {
        console.error('デフォルトファイルパス取得エラー:', error);
      }
    }

    if (!selectedFilePath) {
      fetchDefaultPath();
    }
  }, [selectedFilePath]);

  // SWRを使用してデータをフェッチ
  const { data, isLoading, error, mutate } = useDashboardData(selectedFilePath);

  // 通知表示関数
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ show: true, message, type });
    // 3秒後に通知を自動的に閉じる
    setTimeout(() => {
      hideNotification();
    }, 3000);
  };

  // 通知非表示関数
  const hideNotification = () => {
    setNotification(prev => ({ ...prev, show: false }));
  };

  // データリフレッシュ関数
  const refreshData = () => {
    mutate();
  };

  // コンテキスト値
  const value: DashboardContextType = {
    selectedFilePath,
    setSelectedFilePath,
    dashboardData: {
      summary: data?.summary || null,
      projects: data?.projects || [],
      charts: {
        progressDistribution: data?.charts?.progress_distribution || null,
        durationDistribution: data?.charts?.duration_distribution || null,
      },
    },
    isLoading,
    error,
    refreshData,
    notification,
    showNotification,
    hideNotification,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}