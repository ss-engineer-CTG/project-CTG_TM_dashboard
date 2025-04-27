import { useState, useEffect, useRef, useCallback } from 'react';
import { Project, DashboardMetrics, ErrorInfo } from '../types';
import { apiClient } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';

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
const loadPersistedData = <T>(key: string, maxAge: number = 60 * 60 * 1000): T | null => {
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
 * 最適化された並列データフェッチフック
 * 効率的な並列データ取得を実装
 * 
 * @param filePath - ダッシュボードCSVファイルのパス
 * @returns データと関連機能
 */
export function useParallelDataFetch(filePath: string | null) {
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
  const initialLoadDoneRef = useRef<boolean>(false);

  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    isMounted.current = true;
    
    // キャッシュからデータを読み込む - 最適化バージョン
    if (isClient && !initialLoadDoneRef.current) {
      // 保存データをロードして先に表示
      const cachedProjects = loadPersistedData<Project[]>('projects');
      const cachedMetrics = loadPersistedData<DashboardMetrics>('metrics');
      
      if (cachedProjects) {
        setProjects(cachedProjects);
      }
      
      if (cachedMetrics) {
        setMetrics(cachedMetrics);
      }
      
      initialLoadDoneRef.current = true;
    }
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 並列データ取得関数
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
    
    setIsLoading(true);
    setError(null);
    
    try {
      // プロジェクトデータとメトリクスデータを並列取得
      const [projectsResponse, metricsResponse] = await Promise.all([
        apiClient.get<Project[]>('/projects', { file_path: filePath }, { timeout: 8000 }),
        apiClient.get<DashboardMetrics>('/metrics', { file_path: filePath }, { timeout: 8000 })
      ]);
      
      if (!isMounted.current) {
        fetchingData.current = false;
        return;
      }
      
      // データを更新
      setProjects(projectsResponse);
      setMetrics(metricsResponse);
      
      // データを永続化
      persistData('projects', projectsResponse);
      persistData('metrics', metricsResponse);
      
    } catch (error: any) {
      if (!isMounted.current) {
        fetchingData.current = false;
        return;
      }
      
      const errorMessage = error.message || 'データの取得中にエラーが発生しました';
      const errorDetails = error.details || error;
      
      console.error('データ取得エラー:', error);
      
      setError({ message: errorMessage, details: errorDetails });
      addNotification(errorMessage, 'error');
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
      fetchingData.current = false;
    }
  }, [filePath, addNotification]);

  // ファイルパスが変更されたら自動的にデータを再取得
  useEffect(() => {
    if (!isClient || !isMounted.current) return;
    
    // データロードの遅延初期化 - 最適化版
    let timeoutId: NodeJS.Timeout | null = null;
    
    if (filePath) {
      timeoutId = setTimeout(() => {
        if (isMounted.current) {
          fetchData();
        }
      }, 0);
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [filePath, fetchData]);

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

  // 定期的なデータ更新
  useEffect(() => {
    if (!isClient || !filePath || !isMounted.current) return;
    
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
  }, [filePath, fetchData]);

  return {
    projects,
    metrics,
    isLoading,
    error,
    refreshData,
    fetchData
  };
}