'use client';

import React, { useState, useEffect, Suspense, useCallback, lazy } from 'react';
import { useProjects } from './hooks/useProjects';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import ProjectTable from './components/ProjectTable';
import ErrorMessage from './components/ErrorMessage';
import { getDefaultPath } from './lib/services';
import { useNotification } from './contexts/NotificationContext';
import { useApi } from './contexts/ApiContext';

// 遅延ロードするコンポーネント
const DashboardCharts = lazy(() => import('./components/DashboardCharts'));

// クライアントサイドかどうかをチェック
const isClient = typeof window !== 'undefined';

export default function Home() {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<{message: string, details?: any} | null>(null);
  const { addNotification } = useNotification();
  
  // APIコンテキストから状態を取得
  const { status: apiStatus, checkConnection } = useApi();

  // カスタムフックからプロジェクト状態と関数を取得
  const { 
    projects, 
    metrics, 
    isLoading, 
    error, 
    refreshData, 
    openFile 
  } = useProjects(selectedFilePath);

  // 初回マウント時にデフォルトファイルパスを取得
  useEffect(() => {
    // マウント状態を追跡
    let isMounted = true;
    
    // 前回のパスを復元（ローカルストレージ）
    const loadStoredPath = () => {
      if (!isClient) return null;
      
      try {
        const savedPath = localStorage.getItem('lastSelectedPath');
        if (savedPath) {
          console.log(`前回のファイルパスをロード: ${savedPath}`);
          return savedPath;
        }
      } catch (e) {
        console.log('LocalStorageからの読み込みエラー');
      }
      return null;
    };
    
    // 初期化処理
    const initializeApp = async () => {
      try {
        // ローカルストレージから前回のパスを読み込み
        const storedPath = loadStoredPath();
        if (storedPath) {
          setSelectedFilePath(storedPath);
        }
        
        // API接続が確立されていない場合は確認
        if (!apiStatus.connected && !apiStatus.loading) {
          // 中央管理された接続確認を実行
          const isConnected = await checkConnection();
          
          if (!isMounted) return;
          
          if (!isConnected) {
            console.log('バックエンドサーバーに接続できません');
            // 初回接続失敗時のみエラーメッセージを設定
            if (initError === null) {
              setInitError({
                message: 'バックエンドサーバーに接続できません。',
                details: {
                  reason: '別のアプリケーションがAPIポートを使用している可能性があります。',
                  solution: 'アプリケーションを再起動するか、使用中のアプリケーションを終了してから再試行してください。'
                }
              });
              
              addNotification('バックエンドサーバーに接続できません。', 'error');
            }
          } else {
            // 接続成功時はエラーをクリア
            setInitError(null);
          }
        } else if (apiStatus.connected) {
          // 接続済みの場合はエラーをクリア
          setInitError(null);
        }
        
        // APIが接続されていればデフォルトパスを取得
        if (apiStatus.connected && !storedPath) {
          try {
            const response = await getDefaultPath();
            if (response.success && response.path && isMounted) {
              setSelectedFilePath(response.path);
              
              // パスを保存
              if (isClient) {
                try {
                  localStorage.setItem('lastSelectedPath', response.path);
                } catch (e) {
                  console.log('LocalStorageへの保存エラー');
                }
              }
              
              addNotification('デフォルトファイルを読み込みました', 'success');
            } else {
              console.log('デフォルトファイルパスが取得できませんでした');
            }
          } catch (e) {
            console.log('デフォルトファイルパス取得エラー');
          }
        }
        
      } catch (error: any) {
        console.error(`アプリケーション初期化エラー: ${error.message}`);
        
        if (isMounted) {
          setInitError({
            message: 'アプリケーションの初期化中にエラーが発生しました。APIサーバーに接続できません。',
            details: error
          });
          
          addNotification('APIサーバーに接続できません。', 'error');
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };
    
    // 初期化実行
    initializeApp();
    
    return () => {
      isMounted = false;
    };
  }, [addNotification, apiStatus.connected, apiStatus.loading, checkConnection, initError]);

  // API状態更新のハンドラー
  const handleApiStatusRetry = useCallback(async () => {
    try {
      addNotification('バックエンドサーバーへの再接続を試みています...', 'info');
      const result = await checkConnection();
      
      if (result) {
        addNotification('バックエンドサーバーへの接続が確立されました', 'success');
        // 接続成功時にデータを再読み込み
        refreshData();
      } else {
        addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
      }
    } catch (error) {
      console.error(`API再接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
    }
  }, [addNotification, checkConnection, refreshData]);

  // ファイル選択ハンドラー
  const handleSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    
    // パスを保存
    if (isClient) {
      try {
        localStorage.setItem('lastSelectedPath', path);
      } catch (e) {
        console.log('LocalStorageへの保存エラー');
      }
    }
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <Header 
        updateTime={metrics?.last_updated || '更新情報がありません'} 
        onRefresh={refreshData}
        selectedFilePath={selectedFilePath}
        onSelectFile={handleSelectFile}
      />
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* API接続エラー通知 */}
        {!apiStatus.connected && (
          <div className="mb-4 p-3 rounded bg-red-900 bg-opacity-30">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium text-white">API接続エラー</p>
                  <p className="text-sm text-gray-300">
                    バックエンドサーバーに接続できません
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleApiStatusRetry}
                className="bg-white text-gray-800 px-3 py-1 rounded text-sm transition-colors hover:bg-gray-200"
              >
                再接続
              </button>
            </div>
          </div>
        )}
        
        {/* 初期化エラー表示 */}
        {!isInitializing && initError && (
          <ErrorMessage 
            message={initError.message} 
            details={initError.details}
            onRetry={handleApiStatusRetry}
          />
        )}
        
        {/* データ取得エラー表示 */}
        {error && (
          <ErrorMessage 
            message={error.message} 
            details={error.details} 
            onRetry={refreshData}
          />
        )}
        
        {/* メトリクスカード表示 */}
        {metrics && (
          <MetricsCards 
            summary={metrics.summary} 
            isLoading={isLoading} 
          />
        )}
        
        {/* プロジェクト一覧表示 */}
        <ProjectTable 
          projects={projects || []} 
          isLoading={isLoading}
          onOpenFile={openFile}
          filePath={selectedFilePath || undefined}
        />
        
        {/* チャート表示 - Suspenseによる遅延ロード */}
        {metrics && (
          <Suspense fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="dashboard-card h-80 flex items-center justify-center">
                <div className="animate-pulse text-text-secondary">グラフをロード中...</div>
              </div>
              <div className="dashboard-card h-80 flex items-center justify-center">
                <div className="animate-pulse text-text-secondary">グラフをロード中...</div>
              </div>
            </div>
          }>
            <DashboardCharts
              metrics={metrics}
              isLoading={isLoading}
            />
          </Suspense>
        )}
      </div>
    </main>
  );
}