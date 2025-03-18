'use client';

import React, { useState, useEffect } from 'react';
import { useProjects } from './hooks/useProjects';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import ProjectTable from './components/ProjectTable';
import ProgressChart from './components/ProgressChart';
import DurationChart from './components/DurationChart';
import APIStatus from './components/APIStatus';
import ErrorMessage from './components/ErrorMessage';
import { getDefaultPath, healthCheck, getCurrentApiUrl } from './lib/api';
import { useNotification } from './contexts/NotificationContext';

export default function Home() {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const { 
    projects, 
    metrics, 
    isLoading, 
    apiStatus, 
    error, 
    refreshData, 
    openFile, 
    checkApiConnection 
  } = useProjects(selectedFilePath);
  const { addNotification } = useNotification();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<{message: string, details?: any} | null>(null);

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
          setInitError({
            message: 'デフォルトファイルが見つかりません。ファイルを選択してください。',
            details: response
          });
        }
      } catch (error: any) {
        console.error('アプリケーション初期化エラー:', error);
        
        setInitError({
          message: 'アプリケーションの初期化中にエラーが発生しました。APIサーバーに接続できません。',
          details: error
        });
        
        addNotification('APIサーバーに接続できません。', 'error');
      } finally {
        setIsInitializing(false);
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
        {/* API接続ステータス */}
        <APIStatus status={apiStatus} onRetry={checkApiConnection} />
        
        {/* 初期化エラー */}
        {!isInitializing && initError && (
          <ErrorMessage 
            message={initError.message} 
            details={initError.details} 
          />
        )}
        
        {/* データ取得エラー */}
        {error && (
          <ErrorMessage 
            message={error.message} 
            details={error.details} 
            onRetry={refreshData} 
          />
        )}
        
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
        
        {/* デバッグ情報（開発モードのみ） */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-800 rounded">
            <h3 className="text-yellow-400 text-sm font-medium mb-2">デバッグ情報</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-400">
              <div>
                <p><span className="text-gray-300">環境: </span>{process.env.NODE_ENV}</p>
                <p><span className="text-gray-300">API URL: </span>{getCurrentApiUrl()}</p>
                <p><span className="text-gray-300">ファイルパス: </span>{selectedFilePath || 'なし'}</p>
              </div>
              <div>
                <p><span className="text-gray-300">API状態: </span>{apiStatus.message}</p>
                <p><span className="text-gray-300">最終確認: </span>{apiStatus.lastChecked?.toLocaleTimeString() || 'なし'}</p>
                <p>
                  <button 
                    onClick={checkApiConnection}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    接続テスト
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}