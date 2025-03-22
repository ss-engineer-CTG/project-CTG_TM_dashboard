'use client';

import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { useProjects } from './hooks/useProjects';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import ProjectTable from './components/ProjectTable';
import ConnectionError from './components/ConnectionError';
import ErrorMessage from './components/ErrorMessage';
import EnhancedAPIStatus from './components/EnhancedAPIStatus';
import { getDefaultPath } from './lib/services';
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

// ログレベル定義
const LogLevel = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
  DEBUG: 3
};

// 現在のログレベル（環境に応じて設定）
const currentLogLevel = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.WARNING;

// ロガー関数
const logger = {
  error: (message: string) => console.error(`[Page] ${message}`),
  warn: (message: string) => currentLogLevel >= LogLevel.WARNING && console.warn(`[Page] ${message}`),
  info: (message: string) => currentLogLevel >= LogLevel.INFO && console.info(`[Page] ${message}`),
  debug: (message: string) => currentLogLevel >= LogLevel.DEBUG && console.debug(`[Page] ${message}`)
};

export default function Home() {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<{message: string, details?: any} | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
  const [triedPorts, setTriedPorts] = useState<number[]>([]);
  
  const { addNotification } = useNotification();
  
  // APIコンテキストから状態を取得
  const { status: apiStatus, checkConnection, resetConnection } = useApi();

  // パフォーマンスマーク
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('home_component_mounted');
      window.performance.measure('home_initial_render', 'page_component_start', 'home_component_mounted');
    }
  }, []);

  // カスタムフックからプロジェクト状態と関数を取得
  const { 
    projects, 
    metrics, 
    isLoading, 
    error, 
    refreshData, 
    openFile 
  } = useProjects(selectedFilePath);

  // 初回マウント時にデフォルトファイルパスを取得 - 最適化版
  useEffect(() => {
    // マウント状態を追跡
    let isMounted = true;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('initialization_effect_start');
    }
    
    // 前回のパスを復元（ローカルストレージ）
    const loadStoredPath = () => {
      if (!isClient) return null;
      
      try {
        const savedPath = localStorage.getItem('lastSelectedPath');
        if (savedPath) {
          logger.info(`前回のファイルパスをロード: ${savedPath}`);
          return savedPath;
        }
      } catch (e) {
        logger.debug('LocalStorageからの読み込みエラー');
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
        
        // 接続試行回数を増加
        setConnectionAttempts(prev => prev + 1);
        
        // 標準的なポートリスト
        const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
        setTriedPorts(ports);
        
        // API接続が確立されていない場合は確認
        if (!apiStatus.connected && !apiStatus.loading) {
          // 中央管理された接続確認を実行
          const isConnected = await checkConnection();
          
          if (!isMounted) return;
          
          if (!isConnected) {
            logger.warn('バックエンドサーバーに接続できません');
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
                  logger.debug('LocalStorageへの保存エラー');
                }
              }
              
              addNotification('デフォルトファイルを読み込みました', 'success');
            } else {
              logger.info('デフォルトファイルパスが取得できませんでした');
            }
          } catch (e) {
            logger.warn('デフォルトファイルパス取得エラー');
          }
        }
        
      } catch (error: any) {
        logger.error(`アプリケーション初期化エラー: ${error.message}`);
        
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
          
          // パフォーマンスマーク
          if (typeof window !== 'undefined') {
            window.performance.mark('initialization_effect_complete');
            window.performance.measure('app_initialization', 'initialization_effect_start', 'initialization_effect_complete');
          }
        }
      }
    };
    
    // 初期化実行
    initializeApp();
    
    return () => {
      isMounted = false;
    };
  }, [addNotification, apiStatus.connected, apiStatus.loading, checkConnection, initError]);

  // 接続再試行 - useCallback化
  const handleRetryConnection = useCallback(async () => {
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
      
      // APIコンテキスト経由で接続リセットを実行
      const success = await resetConnection();
      
      if (success) {
        addNotification('APIサーバーに接続しました', 'success');
        setIsInitializing(false);
        
        // デフォルトパス取得を再試行
        try {
          const response = await getDefaultPath();
          if (response.success && response.path) {
            setSelectedFilePath(response.path);
            addNotification('デフォルトファイルを読み込みました', 'success');
          }
        } catch (e) {
          logger.warn('再接続後のデフォルトパス取得エラー');
        }
      } else {
        setInitError({
          message: 'バックエンドサーバーに接続できません。',
          details: {
            reason: '複数回の再試行が失敗しました。',
            solution: 'アプリケーションを再起動してください。'
          }
        });
        
        if (connectionAttempts >= 3) {
          addNotification('複数回の接続試行に失敗しました。アプリケーションを再起動してください。', 'error');
        } else {
          addNotification('APIサーバーに接続できません。', 'error');
        }
        
        setIsInitializing(false);
      }
    } catch (error: any) {
      logger.error(`接続再試行エラー: ${error.message}`);
      setInitError({
        message: 'APIサーバーに接続できません。',
        details: error
      });
      addNotification('APIサーバーへの接続試行中にエラーが発生しました。', 'error');
      setIsInitializing(false);
    }
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('connection_retry_complete');
      window.performance.measure('connection_retry_duration', 'connection_retry_start', 'connection_retry_complete');
    }
  }, [addNotification, connectionAttempts, resetConnection]);

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
      logger.error(`API再接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        logger.debug('LocalStorageへの保存エラー');
      }
    }
  }, []);

  // パフォーマンスマーク - データロード完了時
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
        {/* API状態表示 - 接続エラーの場合のみ表示 */}
        {(!apiStatus.connected || apiStatus.loading) && (
          <EnhancedAPIStatus onRetry={handleApiStatusRetry} />
        )}
        
        {/* 初期化エラー表示 */}
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
        
        {/* 開発環境のみ環境情報表示 */}
        {process.env.NODE_ENV === 'development' && (
          <Suspense fallback={<div className="h-10" />}>
            <ClientInfo />
          </Suspense>
        )}
      </div>
    </main>
  );
}