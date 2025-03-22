'use client';

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useProjects } from './hooks/useProjects';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import ProjectTable from './components/ProjectTable';
import ConnectionError from './components/ConnectionError';
import ErrorMessage from './components/ErrorMessage';
import EnhancedAPIStatus from './components/EnhancedAPIStatus';
import { getDefaultPath } from './lib/services';
// インポートパスを修正
import { testApiConnection } from './lib/api-init';
import { useNotification } from './contexts/NotificationContext';
import { useApi } from './contexts/ApiContext';
import { isClient } from './lib/utils/environment';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('page_component_start');
}

// 遅延ロードするコンポーネント
const DashboardCharts = lazy(() => import('./components/DashboardCharts'));
const ClientInfo = lazy(() => import('./components/ClientInfo'));

// Electron UI初期化用のカスタムフック - 最適化版
const useElectronInitialization = () => {
  const [isElectronReady, setIsElectronReady] = useState(false);

  useEffect(() => {
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('electron_init_start');
    }
    
    // 既にElectron APIが利用可能かチェック
    if (isClient && window.electron) {
      setIsElectronReady(true);
      window.electronReady = true;
      
      // パフォーマンスマーク
      if (typeof window !== 'undefined') {
        window.performance.mark('electron_init_complete');
        window.performance.measure('electron_initialization', 'electron_init_start', 'electron_init_complete');
      }
      return;
    }
    
    // Electron APIが利用可能になるのを待つイベントリスナー
    const handleElectronReady = () => {
      setIsElectronReady(true);
      window.electronReady = true;
      
      // パフォーマンスマーク
      if (typeof window !== 'undefined') {
        window.performance.mark('electron_init_complete');
        window.performance.measure('electron_initialization', 'electron_init_start', 'electron_init_complete');
      }
    };
    
    document.addEventListener('electron-ready', handleElectronReady);
    document.addEventListener('app-init', handleElectronReady);
    
    // 10秒後のタイムアウト処理 - Electronが検出されなくても続行
    const timeoutId = setTimeout(() => {
      if (!isElectronReady) {
        console.warn('Electron初期化のタイムアウト - 検出できない環境として続行');
        setIsElectronReady(true);
      }
    }, 10000);
    
    return () => {
      document.removeEventListener('electron-ready', handleElectronReady);
      document.removeEventListener('app-init', handleElectronReady);
      clearTimeout(timeoutId);
    };
  }, [isElectronReady]);

  return { isElectronReady };
};

export default function Home() {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<{message: string, details?: any} | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
  const [triedPorts, setTriedPorts] = useState<number[]>([]);
  const { addNotification } = useNotification();
  
  // Electron初期化状態を取得
  const { isElectronReady } = useElectronInitialization();
  
  // APIコンテキストから状態を取得
  const { status: apiStatus, reconnectAttempts, checkConnection: checkApiConnection } = useApi();

  // パフォーマンスマーク
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('home_component_mounted');
      window.performance.measure('home_initial_render', 'page_component_start', 'home_component_mounted');
    }
  }, []);

  // カスタムフックから状態と関数を取得
  const { 
    projects, 
    metrics, 
    isLoading, 
    error, 
    refreshData, 
    openFile 
  } = useProjects(selectedFilePath);

  // 初回レンダリング時にデフォルトファイルパスを取得 - 最適化版
  useEffect(() => {
    let isMounted = true;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('initialization_effect_start');
    }
    
    // データ検索を許可する前にAPIの準備が必要
    const timeoutId = setTimeout(() => {
      if (isMounted && isInitializing) {
        setIsInitializing(false);
        console.log('初期化タイムアウト - 待機せずに続行');
      }
    }, 15000); // 15秒タイムアウト設定（10秒から延長）
    
    // 前回のパスをすぐに復元（ローカルストレージ）
    if (isClient) {
      try {
        const savedPath = localStorage.getItem('lastSelectedPath');
        if (savedPath) {
          console.log('前回のファイルパスをロード:', savedPath);
          setSelectedFilePath(savedPath);
        }
      } catch (e) {
        console.warn('LocalStorageからの読み込みエラー:', e);
      }
    }
    
    const initializeApp = async () => {
      try {
        if (!isMounted) return;
        
        setConnectionAttempts(prev => prev + 1);
        
        // APIの健全性をチェック
        const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
        setTriedPorts(ports);
        
        // API接続をチェック - 非同期
        const checkApiPromise = checkApiConnection();
        
        // 並行してデフォルトパスを取得
        try {
          const response = await getDefaultPath();
          if (response.success && response.path) {
            setSelectedFilePath(response.path);
            
            // パスを保存
            if (isClient) {
              try {
                localStorage.setItem('lastSelectedPath', response.path);
              } catch (e) {
                console.warn('LocalStorageへの保存エラー:', e);
              }
            }
            
            addNotification('デフォルトファイルを読み込みました', 'success');
          } else {
            console.log('デフォルトファイルパスが取得できませんでした');
          }
        } catch (e) {
          console.warn('デフォルトファイルパス取得エラー:', e);
        }
        
        // API接続チェックの結果確認（再試行を含む）
        let isConnected = false;
        const maxRetries = 3;
        
        for (let retry = 0; retry < maxRetries; retry++) {
          isConnected = await checkApiPromise;
          
          if (isConnected) break;
          
          // 最後以外の試行なら待機
          if (retry < maxRetries - 1) {
            console.log(`接続試行 ${retry + 1}/${maxRetries} 失敗 - 再試行中...`);
            await new Promise(r => setTimeout(r, 2000));
            await checkApiConnection();
          }
        }
        
        if (!isConnected) {
          setInitError({
            message: 'バックエンドサーバーに接続できません。',
            details: {
              reason: '別のアプリケーションがAPIポートを使用している可能性があります。',
              solution: 'アプリケーションを再起動するか、使用中のアプリケーションを終了してから再試行してください。',
              triedPorts: ports.join(', '),
              retries: maxRetries
            }
          });
          
          addNotification('バックエンドサーバーに接続できません。', 'error');
        }
      } catch (error: any) {
        console.error('アプリケーション初期化エラー:', error);
        
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
          clearTimeout(timeoutId);
          
          // パフォーマンスマーク
          if (typeof window !== 'undefined') {
            window.performance.mark('initialization_effect_complete');
            window.performance.measure('app_initialization', 'initialization_effect_start', 'initialization_effect_complete');
          }
        }
      }
    };
    
    // 非同期関数を直ちに実行
    initializeApp();
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [addNotification, checkApiConnection, isElectronReady]);

  // 接続再試行 - 最適化版
  const handleRetryConnection = async () => {
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('connection_retry_start');
    }
    
    setConnectionAttempts(prev => prev + 1);
    setIsInitializing(true);
    setInitError(null);
    
    try {
      // 接続試行の開始を通知
      addNotification(`バックエンドサーバーへの接続を再試行しています...`, 'info');
      
      // 接続チェック - 複数回試行
      let success = false;
      const maxRetries = 3;
      
      for (let retry = 0; retry < maxRetries; retry++) {
        // 接続チェック
        const result = await testApiConnection();
        
        if (result.success) {
          success = true;
          addNotification('APIサーバーに接続しました', 'success');
          
          const response = await getDefaultPath();
          if (response.success && response.path) {
            setSelectedFilePath(response.path);
            addNotification('デフォルトファイルを読み込みました', 'success');
          }
          break;
        }
        
        // 最後以外の試行なら待機
        if (retry < maxRetries - 1) {
          console.log(`接続再試行 ${retry + 1}/${maxRetries} 失敗 - 再試行中...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      if (!success) {
        setInitError({
          message: 'バックエンドサーバーに接続できません。',
          details: {
            reason: '複数回の再試行が失敗しました。',
            solution: 'アプリケーションを再起動してください。',
            retries: maxRetries
          }
        });
        
        if (connectionAttempts >= 3) {
          addNotification('複数回の接続試行に失敗しました。アプリケーションを再起動してください。', 'error');
        } else {
          addNotification('APIサーバーに接続できません。', 'error');
        }
      }
    } catch (error: any) {
      console.error('接続再試行エラー:', error);
      setInitError({
        message: 'APIサーバーに接続できません。',
        details: error
      });
      addNotification('APIサーバーへの接続試行中にエラーが発生しました。', 'error');
    } finally {
      setIsInitializing(false);
      
      // パフォーマンスマーク
      if (typeof window !== 'undefined') {
        window.performance.mark('connection_retry_complete');
        window.performance.measure('connection_retry_duration', 'connection_retry_start', 'connection_retry_complete');
      }
    }
  };

  // APIステータスの再試行ハンドラー
  const handleApiStatusRetry = async () => {
    try {
      addNotification('バックエンドサーバーへの再接続を試みています...', 'info');
      const result = await checkApiConnection(0, 3); // 3回まで再試行
      
      if (result) {
        addNotification('バックエンドサーバーへの接続が確立されました', 'success');
        // 接続成功時にデータを再読み込み
        refreshData();
      } else {
        addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
      }
    } catch (error) {
      console.error('API再接続エラー:', error);
      addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
    }
  };

  // ファイル選択ハンドラー
  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
    
    // パスを保存
    if (isClient) {
      try {
        localStorage.setItem('lastSelectedPath', path);
      } catch (e) {
        console.warn('LocalStorageへの保存エラー:', e);
      }
    }
  };

  // パフォーマンスマーク - レンダリング完了時
  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoading && (projects || error)) {
      window.performance.mark('data_loaded');
      window.performance.measure('data_loading_time', 'home_component_mounted', 'data_loaded');
    }
  }, [isLoading, projects, error]);

  return (
    <main className="min-h-screen bg-background">
      <Header 
        updateTime={metrics?.last_updated || '更新情報がありません'} 
        onRefresh={refreshData}
        selectedFilePath={selectedFilePath}
        onSelectFile={handleSelectFile}
      />
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        <EnhancedAPIStatus 
          onRetry={handleApiStatusRetry} 
        />
        
        {!isInitializing && initError && initError.message.includes('接続できません') ? (
          <ConnectionError 
            onRetry={handleRetryConnection}
            ports={triedPorts}
            attempts={connectionAttempts}
            lastError={initError.details?.message}
          />
        ) : !isInitializing && initError ? (
          <ErrorMessage 
            message={initError.message} 
            details={initError.details}
            onRetry={handleRetryConnection}
          />
        ) : null}
        
        {error && (
          <ErrorMessage 
            message={error.message} 
            details={error.details} 
            onRetry={refreshData}
          />
        )}
        
        {metrics && (
          <MetricsCards 
            summary={metrics.summary} 
            isLoading={isLoading} 
          />
        )}
        
        <ProjectTable 
          projects={projects || []} 
          isLoading={isLoading}
          onOpenFile={openFile}
          filePath={selectedFilePath || undefined}
        />
        
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
        
        {process.env.NODE_ENV === 'development' && (
          <Suspense fallback={<div className="h-10" />}>
            <ClientInfo />
          </Suspense>
        )}
      </div>
    </main>
  );
}