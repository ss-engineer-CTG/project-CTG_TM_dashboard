'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, DashboardMetrics, APIConnectionStatus, ErrorInfo } from '../lib/types';
import { getProjects, getMetrics, openFile, getInitialData } from '../lib/services';
// インポートパスを変更
import { testApiConnection } from '../lib/api-init';
import { useNotification } from '../contexts/NotificationContext';
import { useApi } from '../contexts/ApiContext';
import { isClient, isElectronEnvironment } from '../lib/utils/environment';
import { setupIpcListeners } from '../lib/electron-utils';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('use_projects_init_start');
}

// データの永続化関数 - 最適化版
const persistData = (key: string, data: any) => {
  if (!isClient) return;
  
  try {
    // 非同期で保存処理を実行して、メインスレッドをブロックしないようにする
    setTimeout(() => {
      try {
        localStorage.setItem(`dashboard_${key}_timestamp`, Date.now().toString());
        localStorage.setItem(`dashboard_${key}`, JSON.stringify(data));
      } catch (e) {
        console.warn(`データ保存エラー (${key}):`, e);
      }
    }, 0);
  } catch (e) {
    // エラーハンドリング - 何もしない
  }
};

// 保存データのロード関数 - 最適化版
const loadPersistedData = (key: string, maxAge: number = 60 * 60 * 1000) => {
  if (!isClient) return null;
  
  try {
    const timestamp = localStorage.getItem(`dashboard_${key}_timestamp`);
    if (!timestamp) return null;
    
    const age = Date.now() - parseInt(timestamp);
    if (age > maxAge) return null;
    
    const data = localStorage.getItem(`dashboard_${key}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

/**
 * プロジェクト情報を管理するカスタムフック - 最適化版
 * 
 * @param filePath - ダッシュボードCSVファイルのパス
 * @returns プロジェクト情報と関連機能
 */
export const useProjects = (filePath: string | null) => {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const { addNotification } = useNotification();
  
  // 最適化: isMountedの参照を使用して、アンマウント後の状態更新を防止
  const isMounted = useRef(true);
  const lastFetchTime = useRef<number>(0);
  
  // キャッシュからの初期ロードフラグ
  const [initialLoadDone, setInitialLoadDone] = useState<boolean>(false);
  
  // APIコンテキストを使用
  const { status: apiStatus, reconnectAttempts, checkConnection: checkApiConnection } = useApi();

  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Electron IPCリスナーのセットアップ - 最適化版
  useEffect(() => {
    if (!isClient || !isElectronEnvironment()) return;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('electron_listeners_setup_start');
    }
    
    // Electron IPCリスナーを設定
    const cleanupListeners = setupIpcListeners({
      onConnectionEstablished: (data) => {
        if (!isMounted.current) return;
        
        console.log('API接続確立:', data);
        addNotification(`APIサーバーへの接続が確立されました`, 'success');
        
        // 接続が確立されたら自動的にデータを更新
        if (filePath) {
          fetchData();
        }
      },
      
      onServerDown: (data) => {
        if (!isMounted.current) return;
        
        console.error('APIサーバーダウン:', data);
        addNotification(data.message || 'バックエンドサーバーが応答していません', 'error');
        
        // エラー表示を更新
        setError({
          message: 'バックエンドサーバーが応答していません',
          details: {
            message: data.message,
            time: new Date().toISOString()
          }
        });
      },
      
      onServerRestarted: (data) => {
        if (!isMounted.current) return;
        
        console.log('APIサーバー再起動:', data);
        addNotification(`バックエンドサーバーが再起動しました`, 'info');
        
        // サーバーが再起動したら自動的にデータを更新
        if (filePath) {
          setTimeout(() => {
            if (isMounted.current) {
              fetchData();
            }
          }, 1000); // 少し待ってからデータ取得
        }
      }
    });
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('electron_listeners_setup_complete');
      window.performance.measure(
        'electron_listeners_setup_duration',
        'electron_listeners_setup_start',
        'electron_listeners_setup_complete'
      );
    }
    
    // クリーンアップ
    return () => {
      if (cleanupListeners) cleanupListeners();
    };
  }, [addNotification, filePath]);

  // キャッシュからデータを読み込む - 最適化版
  useEffect(() => {
    if (!isClient || initialLoadDone) return;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('cache_load_start');
    }
    
    // 保存データをロードして先に表示
    const cachedProjects = loadPersistedData('projects');
    const cachedMetrics = loadPersistedData('metrics');
    
    if (cachedProjects) {
      setProjects(cachedProjects);
      console.log('キャッシュからプロジェクトデータを復元');
    }
    
    if (cachedMetrics) {
      setMetrics(cachedMetrics);
      console.log('キャッシュからメトリクスデータを復元');
    }
    
    setInitialLoadDone(true);
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('cache_load_complete');
      window.performance.measure('cache_load_duration', 'cache_load_start', 'cache_load_complete');
    }
  }, [initialLoadDone]);

  // 改善されたデータ取得関数 - 最適化版
  const fetchData = useCallback(async () => {
    if (!isClient || !isMounted.current) return;
    if (!filePath) {
      addNotification('ファイルが選択されていません', 'error');
      return;
    }
    
    // デバウンス - 連続した呼び出しを防止（500ms以内）
    const now = Date.now();
    if (now - lastFetchTime.current < 500) {
      console.log('連続したデータ取得をスキップ');
      return;
    }
    lastFetchTime.current = now;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('fetch_data_start');
    }
    
    // API接続確認
    if (!apiStatus.connected) {
      const isConnected = await checkApiConnection();
      if (!isConnected || !isMounted.current) return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // 最適化: 両方のデータを一度のリクエストで取得
      const initialData = await getInitialData(filePath);
      
      if (!isMounted.current) return;
      
      if (initialData.projects) {
        setProjects(initialData.projects);
        // データ永続化
        persistData('projects', initialData.projects);
      }
      
      if (initialData.metrics) {
        setMetrics(initialData.metrics);
        // データ永続化
        persistData('metrics', initialData.metrics);
      }
      
      if (initialData.error) {
        throw initialData.error;
      }
      
      // パフォーマンスマーク - 成功
      if (typeof window !== 'undefined') {
        window.performance.mark('fetch_data_success');
        window.performance.measure('fetch_data_success_duration', 'fetch_data_start', 'fetch_data_success');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'データの取得中にエラーが発生しました';
      const errorDetails = error.details || error;
      
      console.error('データ取得エラー:', error);
      
      if (!isMounted.current) return;
      
      setError({ message: errorMessage, details: errorDetails });
      addNotification(errorMessage, 'error');
      
      // パフォーマンスマーク - エラー
      if (typeof window !== 'undefined') {
        window.performance.mark('fetch_data_error');
        window.performance.measure('fetch_data_error_duration', 'fetch_data_start', 'fetch_data_error');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [filePath, addNotification, apiStatus.connected, checkApiConnection]);

  // ファイルパスが変更されたら自動的にデータを再取得 - 最適化版
  useEffect(() => {
    if (!isClient || !isMounted.current) return;
    
    // データロードの遅延初期化
    const timer = setTimeout(() => {
      if (filePath && apiStatus.connected && isMounted.current) {
        fetchData();
      }
    }, 100); // 100ms遅延（状態更新の衝突を避ける）
    
    return () => {
      clearTimeout(timer);
    };
  }, [filePath, fetchData, apiStatus.connected]);

  // データ更新関数 - 最適化版
  const refreshData = useCallback(async () => {
    if (!isClient || !isMounted.current) return;
    if (!filePath) {
      addNotification('ファイルが選択されていません', 'error');
      return;
    }

    try {
      await fetchData();
      if (!error && isMounted.current) {
        addNotification('データが更新されました', 'success');
      }
    } catch (e) {
      console.error("データ更新エラー:", e);
    }
  }, [filePath, fetchData, addNotification, error]);

  // ファイルを開く関数 - 最適化版
  const handleOpenFile = useCallback(async (path: string) => {
    if (!isClient || !isMounted.current) return;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('open_file_start');
    }
    
    try {
      const response = await openFile(path);
      
      if (!isMounted.current) return;
      
      if (response.success) {
        addNotification('ファイルを開きました', 'success');
      } else {
        addNotification(response.message || 'ファイルを開けませんでした', 'error');
      }
      
      // パフォーマンスマーク - 成功
      if (typeof window !== 'undefined') {
        window.performance.mark('open_file_complete');
        window.performance.measure('open_file_duration', 'open_file_start', 'open_file_complete');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'ファイルを開く際にエラーが発生しました';
      console.error('ファイルを開く際のエラー:', error);
      
      if (isMounted.current) {
        addNotification(errorMessage, 'error');
      }
      
      // パフォーマンスマーク - エラー
      if (typeof window !== 'undefined') {
        window.performance.mark('open_file_error');
        window.performance.measure('open_file_error_duration', 'open_file_start', 'open_file_error');
      }
    }
  }, [addNotification]);

  // 定期的なデータ更新の最適化
  useEffect(() => {
    if (!isClient || !filePath || !apiStatus.connected || !isMounted.current) return;
    
    // ビジビリティ変更時の処理
    let intervalId: NodeJS.Timeout | null = null;
    let isActive = true;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // ページが非表示の場合、自動更新を停止
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        isActive = false;
      } else {
        // ページが表示されたら、データを更新し自動更新を再開
        if (!isActive && isMounted.current) {
          fetchData();
          startAutoRefresh();
        }
        isActive = true;
      }
    };
    
    // 自動更新を開始 - 最適化: 間隔を8分に延長
    const startAutoRefresh = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (isActive && isMounted.current) fetchData();
      }, 8 * 60 * 1000); // 8分ごと
    };
    
    // イベントリスナーを登録
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 自動更新を開始
    startAutoRefresh();
    
    // クリーンアップ
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, [filePath, apiStatus.connected, fetchData]);

  // パフォーマンスマーク - 初期化完了
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('use_projects_init_complete');
      window.performance.measure(
        'use_projects_initialization', 
        'use_projects_init_start', 
        'use_projects_init_complete'
      );
    }
  }, []);

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