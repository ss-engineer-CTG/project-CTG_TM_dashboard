'use client';

import React, { useState, useEffect } from 'react';
import { useProjects } from './hooks/useProjects';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import ProjectTable from './components/ProjectTable';
import ProgressChart from './components/ProgressChart';
import DurationChart from './components/DurationChart';
import ConnectionError from './components/ConnectionError';
import ErrorMessage from './components/ErrorMessage';
import EnhancedAPIStatus from './components/EnhancedAPIStatus';
import ClientInfo from './components/ClientInfo';
import { getDefaultPath, testApiConnection } from './lib/services';
import { useNotification } from './contexts/NotificationContext';
import { useApi } from './contexts/ApiContext';
import { isClient } from './lib/utils/environment';

// Electron UI初期化用のカスタムフック
const useElectronInitialization = () => {
  const [isElectronReady, setIsElectronReady] = useState(false);

  useEffect(() => {
    // 既にElectron APIが利用可能かチェック
    if (isClient && window.electron) {
      setIsElectronReady(true);
      window.electronReady = true;
    } else {
      // Electron APIが利用可能になるのを待つイベントリスナー
      const handleElectronReady = () => {
        setIsElectronReady(true);
        window.electronReady = true;
      };
      
      document.addEventListener('electron-ready', handleElectronReady);
      
      return () => {
        document.removeEventListener('electron-ready', handleElectronReady);
      };
    }
  }, []);

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

  // カスタムフックから状態と関数を取得
  const { 
    projects, 
    metrics, 
    isLoading, 
    error, 
    refreshData, 
    openFile 
  } = useProjects(selectedFilePath);

  // 初回レンダリング時にAPIの健全性をチェックしてデフォルトのファイルパスを取得
  useEffect(() => {
    let isMounted = true;
    
    const initializeApp = async () => {
      try {
        if (!isMounted) return;
        
        setConnectionAttempts(prev => prev + 1);
        
        // APIの健全性をチェック
        const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
        setTriedPorts(ports);
        
        // Electron環境の場合はElectron APIの準備完了を待機
        if (isClient && !isElectronReady && window.electron) {
          console.log('Electron API準備中、初期化を待機します...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // API接続をチェック
        const isConnected = await checkApiConnection();
        
        if (!isConnected) {
          setInitError({
            message: 'バックエンドサーバーに接続できません。',
            details: {
              reason: '別のアプリケーションがAPIポートを使用している可能性があります。',
              solution: 'アプリケーションを再起動するか、使用中のアプリケーションを終了してから再試行してください。'
            }
          });
          
          addNotification('バックエンドサーバーに接続できません。', 'error');
          setIsInitializing(false);
          return;
        }
        
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
    
    initializeApp();
    
    return () => {
      isMounted = false;
    };
  }, [addNotification, checkApiConnection, isElectronReady]);

  // 接続再試行
  const handleRetryConnection = async () => {
    setConnectionAttempts(prev => prev + 1);
    setIsInitializing(true);
    setInitError(null);
    
    try {
      const waitTime = Math.min(connectionAttempts * 1000, 5000);
      
      addNotification(`バックエンドサーバーへの接続を再試行しています...(${waitTime}ms 待機)`, 'info');
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      const result = await testApiConnection();
      if (result.success) {
        addNotification('APIサーバーに接続しました', 'success');
        
        const response = await getDefaultPath();
        if (response.success && response.path) {
          setSelectedFilePath(response.path);
          addNotification('デフォルトファイルを読み込みました', 'success');
        }
      } else {
        setInitError({
          message: 'バックエンドサーバーに接続できません。',
          details: result.details
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
    }
  };

  // APIステータスの再試行ハンドラー
  const handleApiStatusRetry = async () => {
    try {
      addNotification('バックエンドサーバーへの再接続を試みています...', 'info');
      await checkApiConnection();
    } catch (error) {
      console.error('API再接続エラー:', error);
      addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
    }
  };

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
        
        <ClientInfo />
      </div>
    </main>
  );
}