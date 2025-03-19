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
import { getDefaultPath, healthCheck, getCurrentApiUrl, testApiConnection, updateApiPort } from './lib/api';
import { useNotification } from './contexts/NotificationContext';
import { APIConnectionStatus } from './lib/types';

// クライアントサイドのみの処理を判定するヘルパー関数
const isClient = typeof window !== 'undefined';

// グローバルに追加: 現在のAPIポート (サーバー接続後に更新)
if (isClient) {
  // サーバーサイドレンダリング時にはwindowが存在しないため、クライアント側でのみ定義
  window.currentApiPort = window.currentApiPort || undefined;
}

const FirstTimeUserGuide: React.FC<{onClose: () => void}> = ({onClose}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="dashboard-card max-w-2xl w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-text-primary">プロジェクト進捗ダッシュボードへようこそ</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          <p className="text-text-primary">
            このアプリケーションを使ってプロジェクトの進捗を可視化しましょう。
            以下の簡単なステップで始められます：
          </p>
          
          <ol className="list-decimal pl-6 space-y-2 text-text-primary">
            <li>右上の「<span className="text-text-accent">参照</span>」ボタンをクリックして、プロジェクトデータCSVファイルを選択します。</li>
            <li>データが読み込まれると、プロジェクト一覧とメトリクスが表示されます。</li>
            <li>進捗グラフやプロジェクト期間の分布を確認できます。</li>
            <li>各プロジェクトの詳細とタスク情報が表示されます。</li>
          </ol>
          
          <p className="text-text-primary">
            初めてお使いの場合は、サンプルデータが自動的に表示されます。
            実際のプロジェクトデータを使用するには、正しいCSV形式で用意してください。
          </p>
          
          <div className="text-center mt-6">
            <button 
              onClick={onClose}
              className="bg-text-accent text-surface px-4 py-2 rounded text-sm hover:bg-opacity-80 transition-colors"
            >
              始める
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<{message: string, details?: any} | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
  const [triedPorts, setTriedPorts] = useState<number[]>([]);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const { addNotification } = useNotification();

  // カスタムフックから状態と関数を取得
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

  // 初回レンダリング時にAPIの健全性をチェックしてデフォルトのファイルパスを取得
  // クライアントサイドでのみ実行
  useEffect(() => {
    // サーバーサイドレンダリング時は何もしない
    if (!isClient) return;
    
    const initializeApp = async () => {
      try {
        setConnectionAttempts(prev => prev + 1);
        // APIの健全性をチェック - 複数ポートを試行
        let connected = false;
        const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
        setTriedPorts(ports);
        
        // 自動接続試行
        const connectionResult = await testApiConnection(3);
        if (connectionResult.success) {
          connected = true;
          if (connectionResult.port) {
            updateApiPort(connectionResult.port);
          }
        }
        
        if (!connected) {
          // エラーメッセージの表示とヘルプの提供
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
        
        setInitError({
          message: 'アプリケーションの初期化中にエラーが発生しました。APIサーバーに接続できません。',
          details: error
        });
        
        addNotification('APIサーバーに接続できません。', 'error');
      } finally {
        setIsInitializing(false);
        
        // ローカルストレージで初回起動かどうかを確認
        try {
          const hasVisitedBefore = localStorage.getItem('hasVisitedBefore');
          if (!hasVisitedBefore) {
            setShowGuide(true);
            localStorage.setItem('hasVisitedBefore', 'true');
          }
        } catch (e) {
          // ローカルストレージへのアクセスエラーを無視
          console.warn('ローカルストレージへのアクセスエラー:', e);
        }
      }
    };
    
    initializeApp();

    // IPC通信リスナーの設定 (Electron環境)
    const setupIpcListeners = () => {
      if (window.electron && window.electron.ipcRenderer) {
        // API接続確立メッセージのリスナー
        const handleConnectionEstablished = (data: { port: number, apiUrl: string }) => {
          console.log('API接続確立メッセージを受信:', data);
          addNotification(`バックエンドサーバーに接続しました (ポート: ${data.port})`, 'success');
          setInitError(null);
          setReconnectAttempts(0);
          
          // データの再取得
          refreshData();
        };
        
        // APIサーバーダウンメッセージのリスナー
        const handleServerDown = (data: { message: string }) => {
          console.warn('APIサーバーダウンメッセージを受信:', data);
          addNotification('バックエンドサーバーとの接続が切断されました', 'error');
          setReconnectAttempts(prev => prev + 1);
        };
        
        // リスナーの登録
        const removeConnectionListener = window.electron.ipcRenderer.on(
          'api-connection-established',
          handleConnectionEstablished
        );
        
        const removeServerDownListener = window.electron.ipcRenderer.on(
          'api-server-down',
          handleServerDown
        );
        
        // クリーンアップ関数
        return () => {
          if (removeConnectionListener) removeConnectionListener();
          if (removeServerDownListener) removeServerDownListener();
        };
      }
      
      return undefined;
    };
    
    const cleanupListeners = setupIpcListeners();
    
    return () => {
      if (cleanupListeners) cleanupListeners();
    };
  }, [addNotification, refreshData]);

  // 接続再試行
  const handleRetryConnection = async () => {
    setConnectionAttempts(prev => prev + 1);
    setIsInitializing(true);
    setInitError(null);
    
    try {
      // 前回の試行から時間をおいて再試行 (試行回数に応じて待機時間を調整)
      const waitTime = Math.min(connectionAttempts * 1000, 5000);
      
      // ユーザーにフィードバック
      addNotification(`バックエンドサーバーへの接続を再試行しています...(${waitTime}ms 待機)`, 'info');
      
      // 接続試行
      const result = await testApiConnection(3);
      if (result.success) {
        addNotification('APIサーバーに接続しました', 'success');
        setReconnectAttempts(0);
        
        if (result.port) {
          updateApiPort(result.port);
        }
        
        // デフォルトパスを取得
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
        
        // 接続試行回数に応じてより詳細なエラーメッセージを表示
        if (connectionAttempts >= 3) {
          addNotification('複数回の接続試行に失敗しました。アプリケーションを再起動してください。', 'error');
        } else {
          addNotification('APIサーバーに接続できません。', 'error');
        }
        
        setReconnectAttempts(prev => prev + 1);
      }
    } catch (error: any) {
      console.error('接続再試行エラー:', error);
      setInitError({
        message: 'APIサーバーに接続できません。',
        details: error
      });
      addNotification('APIサーバーへの接続試行中にエラーが発生しました。', 'error');
      setReconnectAttempts(prev => prev + 1);
    } finally {
      setIsInitializing(false);
    }
  };

  // APIステータスの再試行ハンドラー
  const handleApiStatusRetry = async () => {
    setReconnectAttempts(prev => prev + 1);
    
    // 再接続の試行間隔を調整 (試行回数に応じて)
    const retryDelay = Math.min(reconnectAttempts * 1000, 3000);
    
    try {
      addNotification('バックエンドサーバーへの再接続を試みています...', 'info');
      await checkApiConnection(retryDelay);
    } catch (error) {
      console.error('API再接続エラー:', error);
      addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
    }
  };

  // ファイル選択ハンドラー
  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
  };

  // デバッグ情報のAPIポート取得 - クライアントサイドのみ
  const getCurrentApiPort = () => {
    if (!isClient) return '不明';
    return window.currentApiPort || '不明';
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
        {/* API接続ステータス - 拡張コンポーネントを使用 */}
        <EnhancedAPIStatus 
          status={apiStatus} 
          onRetry={handleApiStatusRetry} 
          reconnectAttempts={reconnectAttempts} 
        />
        
        {/* 初期化エラー - 接続エラーの場合は専用コンポーネント */}
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
            suggestion="アプリケーションを再起動するか、別のCSVファイルを選択してください。"
          />
        ) : null}
        
        {/* データ取得エラー */}
        {error && (
          <ErrorMessage 
            message={error.message} 
            details={error.details} 
            onRetry={refreshData}
            suggestion="データ形式が正しいか確認してください。日本語を含む場合はUTF-8で保存されているか確認してください。"
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
                <p><span className="text-gray-300">現在のAPIポート: </span>{getCurrentApiPort()}</p>
              </div>
              <div>
                <p><span className="text-gray-300">API状態: </span>{apiStatus.message}</p>
                <p><span className="text-gray-300">最終確認: </span>
                   {apiStatus.lastChecked ? apiStatus.lastChecked.toLocaleTimeString() : 'なし'}
                </p>
                <p><span className="text-gray-300">接続試行回数: </span>{connectionAttempts}</p>
                <p><span className="text-gray-300">再接続試行回数: </span>{reconnectAttempts}</p>
                <p>
                  <button 
                    onClick={() => checkApiConnection()}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    接続テスト
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* 初回起動ガイド */}
        {showGuide && <FirstTimeUserGuide onClose={() => setShowGuide(false)} />}
      </div>
    </main>
  );
}