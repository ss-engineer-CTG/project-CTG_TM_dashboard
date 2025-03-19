'use client';

import { useState, useEffect, useCallback } from 'react';
import { Project, DashboardMetrics, APIConnectionStatus, ErrorInfo } from '../lib/types';
import { getProjects, getMetrics, openFile, testApiConnection } from '../lib/api';
import { useNotification } from '../contexts/NotificationContext';

// クライアントサイドのみの処理を判定するヘルパー関数
const isClient = typeof window !== 'undefined';

/**
 * プロジェクト情報を管理するカスタムフック
 * 
 * @param filePath - ダッシュボードCSVファイルのパス
 * @returns プロジェクト情報と関連機能
 */
export const useProjects = (filePath: string | null) => {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiStatus, setApiStatus] = useState<APIConnectionStatus>({
    connected: false,
    loading: true,
    message: 'API接続確認中...',
    lastChecked: null
  });
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const { addNotification } = useNotification();

  // API接続をテスト - retryDelay 引数を追加
  const checkApiConnection = useCallback(async (retryDelay: number = 0) => {
    setApiStatus(prev => ({ ...prev, loading: true }));
    
    // 待機時間がある場合は待機
    if (retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    try {
      const result = await testApiConnection();
      
      setApiStatus({
        connected: result.success,
        loading: false,
        message: result.message,
        lastChecked: new Date(),
        details: result.details
      });
      
      // 接続成功したらカウンタをリセット
      if (result.success) {
        if (reconnectAttempts > 0) {
          addNotification('バックエンドサーバーへの接続が回復しました', 'success');
        }
        setReconnectAttempts(0);
      } else {
        console.error('API接続エラー:', result);
        setReconnectAttempts(prev => prev + 1);
        addNotification(result.message, 'error');
      }
      
      return result.success;
    } catch (error: any) {
      console.error('API接続テスト中の予期しないエラー:', error);
      
      setApiStatus({
        connected: false,
        loading: false,
        message: `API接続エラー: ${error instanceof Error ? error.message : '不明なエラー'}`,
        lastChecked: new Date()
      });
      
      setReconnectAttempts(prev => prev + 1);
      addNotification('APIサーバーへの接続に失敗しました', 'error');
      return false;
    }
  }, [addNotification, reconnectAttempts]);

  // 初回マウント時にAPI接続をテスト - クライアントサイドでのみ実行
  useEffect(() => {
    // サーバーサイドレンダリング時は何もしない
    if (!isClient) return;
    
    checkApiConnection();
    
    // IPC メッセージリスナー (Electron環境)
    const setupIpcListeners = () => {
      if (window.electron && window.electron.ipcRenderer) {
        // メインプロセスから接続確立メッセージを受信するリスナー
        const handleConnectionEstablished = (data: { port: number, apiUrl: string }) => {
          console.log('APIサーバー接続確立メッセージを受信:', data);
          
          // APIステータスを更新
          setApiStatus({
            connected: true,
            loading: false,
            message: `APIサーバーに接続しました (ポート: ${data.port})`,
            lastChecked: new Date()
          });
          
          addNotification(`バックエンドサーバーに接続しました (ポート: ${data.port})`, 'success');
          setReconnectAttempts(0);
          
          // データを再読み込み
          if (filePath) {
            fetchData();
          }
        };
        
        // APIサーバーダウンのメッセージを受信するリスナー
        const handleServerDown = (data: { message: string }) => {
          console.warn('APIサーバーダウンメッセージを受信:', data);
          
          // APIステータスを更新
          setApiStatus({
            connected: false,
            loading: false,
            message: data.message || 'バックエンドサーバーが応答していません',
            lastChecked: new Date()
          });
          
          addNotification('バックエンドサーバーとの接続が切断されました', 'error');
          setReconnectAttempts(prev => prev + 1);
        };
        
        // リスナーを設定
        const removeConnectionListener = window.electron.ipcRenderer.on(
          'api-connection-established', 
          handleConnectionEstablished
        );
        
        const removeServerDownListener = window.electron.ipcRenderer.on(
          'api-server-down', 
          handleServerDown
        );
        
        // クリーンアップ
        return () => {
          if (removeConnectionListener) removeConnectionListener();
          if (removeServerDownListener) removeServerDownListener();
        };
      }
      
      return undefined;
    };
    
    const cleanup = setupIpcListeners();
    
    // 定期的に接続をチェック (5分ごと)
    const intervalId = setInterval(() => {
      if (!isLoading) {
        checkApiConnection();
      }
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(intervalId);
      if (cleanup) cleanup();
    };
  }, [checkApiConnection, isLoading, filePath, addNotification]);

  // データ取得関数
  const fetchData = useCallback(async () => {
    if (!filePath) {
      addNotification('ファイルが選択されていません', 'error');
      return;
    }
    
    // 接続状態をチェック
    const isConnected = await checkApiConnection();
    if (!isConnected) {
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // プロジェクト一覧とメトリクスを並行して取得
      const [projectsData, metricsData] = await Promise.all([
        getProjects(filePath),
        getMetrics(filePath)
      ]);

      setProjects(projectsData);
      setMetrics(metricsData);
    } catch (error: any) {
      const errorMessage = error.message || 'データの取得中にエラーが発生しました';
      const errorDetails = error.details || error;
      
      console.error('データ取得エラー:', error);
      setError({ message: errorMessage, details: errorDetails });
      addNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [filePath, addNotification, checkApiConnection]);

  // ファイルパスが変更されたら自動的にデータを再取得 - クライアントサイドでのみ実行
  useEffect(() => {
    // サーバーサイドレンダリング時は何もしない
    if (!isClient) return;
    
    if (filePath) {
      fetchData();
    }
  }, [filePath, fetchData]);

  // データ更新関数
  const refreshData = useCallback(() => {
    if (!filePath) {
      addNotification('ファイルが選択されていません', 'error');
      return;
    }

    fetchData()
      .then(() => {
        if (!error) {
          addNotification('データが更新されました', 'success');
        }
      })
      .catch(() => {});
  }, [filePath, fetchData, addNotification, error]);

  // ファイルを開く関数
  const handleOpenFile = useCallback(async (path: string) => {
    try {
      const response = await openFile(path);
      if (response.success) {
        addNotification('ファイルを開きました', 'success');
      } else {
        addNotification(response.message || 'ファイルを開けませんでした', 'error');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'ファイルを開く際にエラーが発生しました';
      console.error('ファイルを開く際のエラー:', error);
      addNotification(errorMessage, 'error');
    }
  }, [addNotification]);

  return {
    projects,
    metrics,
    isLoading,
    apiStatus,
    reconnectAttempts,
    error,
    refreshData,
    fetchData,
    openFile: handleOpenFile,
    checkApiConnection
  };
};