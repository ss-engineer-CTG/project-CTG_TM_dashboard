'use client';

import React from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import Header from '@/components/Header';
import SummaryCards from '@/components/SummaryCards';
import ProjectTable from '@/components/ProjectTable';
import ChartSection from '@/components/ChartSection';
import Notification from '@/components/Notification';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Home() {
  const { 
    dashboardData, 
    isLoading, 
    error,
    notification
  } = useDashboard();

  return (
    <main className="min-h-screen bg-dark-bg">
      <Header />
      
      {/* 通知コンポーネント */}
      {notification.show && (
        <Notification 
          message={notification.message} 
          type={notification.type} 
        />
      )}
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-80">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="card p-6 text-danger">
            <h2 className="text-xl font-bold mb-2">エラーが発生しました</h2>
            <p>{error.message}</p>
          </div>
        ) : (
          <>
            {/* サマリーカード */}
            <SummaryCards summary={dashboardData.summary} />
            
            {/* プロジェクト一覧 */}
            <div className="card mb-6">
              <h2 className="text-xl font-bold mb-4">プロジェクト一覧</h2>
              <div className="overflow-x-auto scrollbar-thin max-h-[600px] overflow-y-auto">
                <ProjectTable projects={dashboardData.projects} />
              </div>
            </div>
            
            {/* チャートセクション */}
            <ChartSection 
              progressDistribution={dashboardData.charts.progressDistribution}
              durationDistribution={dashboardData.charts.durationDistribution}
            />
          </>
        )}
      </div>
    </main>
  );
}