'use client';

import React, { useState, useEffect } from 'react';
import { useProjects } from '@/hooks/useProjects';
import Header from '@/components/Header';
import MetricsCards from '@/components/MetricsCards';
import ProjectTable from '@/components/ProjectTable';
import ProgressChart from '@/components/ProgressChart';
import DurationChart from '@/components/DurationChart';
import { getDefaultPath, healthCheck } from '@/lib/api';
import { useNotification } from '@/contexts/NotificationContext';

export default function Home() {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const { projects, metrics, isLoading, refreshData, openFile } = useProjects(selectedFilePath);
  const { addNotification } = useNotification();

  // 初回レンダリング時にAPIの健全性をチェックしてデフォルトのファイルパスを取得
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // APIの健全性をチェック
        await healthCheck();
        
        // デフォルトパスを取得
        const response = await getDefaultPath();
        if (response.success && response.path) {
          setSelectedFilePath(response.path);
          addNotification('デフォルトファイルを読み込みました', 'success');
        } else {
          addNotification('デフォルトファイルが見つかりません。ファイルを選択してください。', 'error');
        }
      } catch (error) {
        console.error('アプリケーション初期化エラー:', error);
        addNotification('APIサーバーに接続できません。', 'error');
      }
    };
    
    initializeApp();
  }, [addNotification]);

  // ファイル選択ハンドラー
  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
  };

  return (
    <main className="min-h-screen bg-background">
      <Header 
        updateTime={metrics?.last_updated || '更新情報がありません'} 
        onRefresh={refreshData}
        selectedFilePath={selectedFilePath}
        onSelectFile={handleSelectFile}
      />
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* メトリクスカード */}
        {metrics && (
          <MetricsCards 
            summary={metrics.summary} 
            isLoading={isLoading} 
          />
        )}
        
        {/* プロジェクト一覧 */}
        <ProjectTable 
          projects={projects || []} 
          isLoading={isLoading}
          onOpenFile={openFile}
          filePath={selectedFilePath || undefined}
        />
        
        {/* グラフセクション */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProgressChart 
              data={metrics.progress_distribution} 
              isLoading={isLoading} 
            />
            <DurationChart 
              data={metrics.duration_distribution} 
              isLoading={isLoading} 
            />
          </div>
        )}
      </div>
    </main>
  );
}