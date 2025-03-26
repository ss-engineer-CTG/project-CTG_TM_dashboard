import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, DashboardMetrics, ErrorInfo } from '../types';
import { getInitialData, openFile } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';
import { useApi } from '../contexts/ApiContext';

// クライアントサイドかどうかをチェック
const isClient = typeof window !== 'undefined';

// データの永続化関数
const persistData = (key: string, data: any) => {
  if (!isClient) return;
  
  try {
    // 非同期で保存処理を実行して、メインスレッドをブロックしないようにする
    setTimeout(() => {
      try {
        localStorage.setItem(`dashboard_${key}_timestamp`, Date.now().toString());
        localStorage.setItem(`dashboard_${key}`, JSON.stringify(data));
      } catch (e) {
        /* エラーを無視 */
      }
    }, 0);
  } catch (e) {
    /* エラーを無視 */
  }
};

// 保存データのロード関数
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
 * プロジェクト情報を管理するカスタムフック
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
  
  // マウント状態の参照を使用して、アンマウント後の状態更新を防止
  const isMounted = useRef(true);
  const lastFetchTime = useRef<number>(0);
  const fetchingData = useRef<boolean>(false);
  
  // キャッシュからの初期ロードフラグ
  const [initialLoadDone, setInitialLoadDone] = useState<boolean>(false);
  
  // APIコンテキストから状態を取得
  const { status: apiStatus } = useApi();

  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // キャッシュからデータを読み込む
  useEffect(() => {
    if (!isClient || initialLoadDone) return;
    
    // 保存データをロードして先に表示
    const cachedProjects = loadPersistedData('projects');
    const cachedMetrics = loadPersistedData('metrics');
    
    if (cachedProjects) {
      setProjects(cachedProjects);
    }
    
    if (cachedMetrics) {
      setMetrics(cachedMetrics);
    }
    
    setInitialLoadDone(true);
  }, [initialLoadDone]);

  // データ取得関数
  const fetchData = useCallback(async () => {
    if (!isClient || !isMounted.current || !filePath) {
      return;
    }
    
    // 既にデータ取得中の場合は重複実行を避ける
    if (fetchingData.current) {
      return;
    }
    
    // デバウンス - 連続した呼び出しを防止（500ms以内）
    const now = Date.now();
    if (now - lastFetchTime.current < 500) {
      return;
    }
    
    lastFetchTime.current = now;
    fetchingData.current = true;
    
    // API接続が確立されていることを確認
    if (!apiStatus.connected) {
      console.log('API接続が確立されていないため、データ取得をスキップします');
      fetchingData.current = false;
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // 両方のデータを一度のリクエストで取得
      const initialData = await getInitialData(filePath);
      
      if (!isMounted.current) {
        fetchingData.current = false;
        return;
      }
      
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
    } catch (error: any) {
      const errorMessage = error.message || 'データの取得中にエラーが発生しました';
      const errorDetails = error.details || error;
      
      console.error('データ取得エラー:', error);
      
      if (!isMounted.current) {
        fetchingData.current = false;
        return;
      }
      
      setError({ message: errorMessage, details: errorDetails });
      addNotification(errorMessage, 'error');
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
      fetchingData.current = false;
    }
  }, [filePath, addNotification, apiStatus.connected]);

  // ファイルパスが変更されたら自動的にデータを再取得
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

  // データ更新関数
  const refreshData = useCallback(async () => {
    if (!isClient || !isMounted.current || !filePath) {
      if (!filePath) {
        addNotification('ファイルが選択されていません', 'error');
      }
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

  // ファイルを開く関数
  const handleOpenFile = useCallback(async (path: string) => {
    if (!isClient || !isMounted.current) return;
    
    try {
      // パスの種類を識別するための正規表現
      const isDirectory = /[/\\]$/.test(path) || !path.includes('.');
      const openingType = isDirectory ? 'フォルダ' : 'ファイル';
      
      // 処理中の通知
      addNotification(`${openingType}を開いています...`, 'info');
      
      const response = await openFile(path);
      
      if (!isMounted.current) return;
      
      if (response.success) {
        // 成功時の通知をファイルタイプに応じて変更
        addNotification(
          isDirectory ? 'フォルダを開きました' : 'ファイルを開きました', 
          'success'
        );
      } else {
        // エラーメッセージの詳細化
        let errorMsg = response.message || `${openingType}を開けませんでした`;
        
        // 詳細なエラーメッセージを追加
        if (errorMsg.includes('見つかりません') || errorMsg.includes('not found')) {
          errorMsg = `${openingType}が見つかりません: ${path}`;
        } else if (errorMsg.includes('permission') || errorMsg.includes('アクセス')) {
          errorMsg = `${openingType}へのアクセス権限がありません: ${path}`;
        }
        
        addNotification(errorMsg, 'error');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'ファイルを開く際にエラーが発生しました';
      console.error('ファイルを開く際のエラー:', error);
      
      if (isMounted.current) {
        addNotification(errorMessage, 'error');
      }
    }
  }, [addNotification]);

  // 定期的なデータ更新
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
    
    // 自動更新を開始 - 8分に延長
    const startAutoRefresh = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (isActive && isMounted.current && !fetchingData.current) fetchData();
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

  // キーボードショートカットリスナー
  useEffect(() => {
    if (!isClient || !window.electron?.shortcuts) return;

    // Ctrl+R/Cmd+Rで更新
    const removeRefreshListener = window.electron.shortcuts.onRefreshData(() => {
      if (filePath) {
        refreshData();
      }
    });

    return () => {
      if (removeRefreshListener) removeRefreshListener();
    };
  }, [filePath, refreshData]);

  return {
    projects,
    metrics,
    isLoading,
    error,
    refreshData,
    fetchData,
    openFile: handleOpenFile
  };
};