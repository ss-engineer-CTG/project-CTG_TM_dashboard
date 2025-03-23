'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { APIConnectionStatus } from '../lib/types';
import { testApiConnection, initializeApi, rediscoverApiPort } from '../lib/api-init';
import { useNotification } from './NotificationContext';

// パフォーマンス測定
if (typeof window !== 'undefined') {
  window.performance.mark('api_context_init_start');
}

interface ApiContextType {
  status: APIConnectionStatus;
  reconnectAttempts: number;
  checkConnection: (retryDelay?: number) => Promise<boolean>;
  resetConnection: () => Promise<boolean>;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<APIConnectionStatus>({
    connected: false,
    loading: true,
    message: 'API接続確認中...',
    lastChecked: null,
    reconnectAttempts: 0  // 必須プロパティとして追加
  });
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const { addNotification } = useNotification();
  
  // 最適化: マウント状態管理と参照保持
  const isMounted = useRef(true);
  const lastConnectionTime = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkingConnection = useRef<boolean>(false);
  
  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  // 改善されたAPI接続確認関数 - 中央集権的な接続管理
  const checkConnection = useCallback(async (retryDelay: number = 0): Promise<boolean> => {
    if (!isMounted.current) return false;
    
    // 既に確認中の場合は重複実行を避ける
    if (checkingConnection.current) {
      return status.connected;
    }
    
    // 過度に頻繁な接続チェックを防止（少なくとも800ms間隔を空ける）
    const now = Date.now();
    if (lastConnectionTime.current && now - lastConnectionTime.current < 800) {
      return status.connected;
    }
    
    lastConnectionTime.current = now;
    checkingConnection.current = true;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('connection_check_start');
    }
    
    // 接続ステータスを更新
    setStatus(prev => ({ ...prev, loading: true }));
    
    if (retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    try {
      // API接続テスト
      const result = await testApiConnection();
      
      if (!isMounted.current) {
        checkingConnection.current = false;
        return false;
      }
      
      if (result.success) {
        setStatus({
          connected: true,
          loading: false,
          message: result.message || 'APIサーバーに接続しました',
          lastChecked: new Date(),
          details: result.details,
          reconnectAttempts: 0 // 初期化
        });
        
        if (reconnectAttempts > 0) {
          addNotification('バックエンドサーバーへの接続が回復しました', 'success');
        }
        
        setReconnectAttempts(0);
        checkingConnection.current = false;
        return true;
      }
      
      // 接続失敗
      const newReconnectAttempts = reconnectAttempts + 1;
      setReconnectAttempts(newReconnectAttempts);
      
      setStatus({
        connected: false,
        loading: false,
        message: result.message || 'APIサーバーへの接続に失敗しました',
        lastChecked: new Date(),
        details: result.details,
        reconnectAttempts: newReconnectAttempts
      });
      
      if (reconnectAttempts < 3) {
        addNotification(result.message || 'APIサーバーへの接続に失敗しました', 'error');
      }
      
      checkingConnection.current = false;
      return false;
    } catch (error: any) {
      if (!isMounted.current) {
        checkingConnection.current = false;
        return false;
      }
      
      // エラー処理
      const newReconnectAttempts = reconnectAttempts + 1;
      setReconnectAttempts(newReconnectAttempts);
      
      setStatus({
        connected: false,
        loading: false,
        message: `APIサーバーへの接続中にエラーが発生しました: ${error.message}`,
        lastChecked: new Date(),
        reconnectAttempts: newReconnectAttempts
      });
      
      if (reconnectAttempts < 3) {
        addNotification('APIサーバーへの接続に失敗しました', 'error');
      }
      
      checkingConnection.current = false;
      return false;
    }
  }, [addNotification, reconnectAttempts, status.connected]);

  // 接続リセット機能 - 完全に新しい接続を確立
  const resetConnection = useCallback(async (): Promise<boolean> => {
    if (!isMounted.current) return false;
    
    setStatus(prev => ({ ...prev, loading: true, message: 'API接続をリセット中...' }));
    
    try {
      // APIポート再検出を実行
      const port = await rediscoverApiPort();
      
      if (!port || !isMounted.current) {
        setStatus(prev => ({ 
          ...prev, 
          loading: false, 
          connected: false,
          message: 'APIポート再検出に失敗しました',
          reconnectAttempts: prev.reconnectAttempts
        }));
        return false;
      }
      
      // 接続確認
      return await checkConnection();
    } catch (error: any) {
      if (isMounted.current) {
        setStatus(prev => ({ 
          ...prev, 
          loading: false, 
          connected: false,
          message: `接続リセット中にエラーが発生しました: ${error.message}`,
          reconnectAttempts: prev.reconnectAttempts
        }));
      }
      return false;
    }
  }, [checkConnection]);

  // 初期接続確認 - アプリケーション起動時の一度だけ実行
  useEffect(() => {
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('initial_connection_check_start');
    }
    
    // 初期接続タイムアウト処理
    connectionTimeoutRef.current = setTimeout(() => {
      if (isMounted.current && status.loading) {
        setStatus(prev => ({
          ...prev,
          loading: false,
          message: 'API接続タイムアウト。再試行してください。',
          reconnectAttempts: prev.reconnectAttempts
        }));
      }
    }, 15000); // 15秒タイムアウト
    
    // API初期化処理
    const initializeConnection = async () => {
      try {
        // API初期化の一元管理
        await initializeApi();
        
        // 接続確認を実行
        if (isMounted.current) {
          await checkConnection();
        }
      } catch (error) {
        console.error('初期接続エラー:', error);
      }
    };
    
    initializeConnection();
    
    // クリーンアップ関数
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };
  }, [checkConnection]);

  // 接続状態監視 - 接続確立後の定期的なヘルスチェック
  useEffect(() => {
    if (!isMounted.current) return;
    
    // 最初の接続チェックを1秒後に再試行
    if (!status.connected && status.loading) {
      const initialCheckTimer = setTimeout(() => {
        checkConnection(0);
      }, 1000);
      
      return () => clearTimeout(initialCheckTimer);
    }
    
    // 接続成功時は定期的なチェックを設定
    if (status.connected) {
      const intervalId = setInterval(() => {
        if (isMounted.current && !checkingConnection.current) {
          checkConnection();
        }
      }, 60 * 1000); // 1分ごとにチェック (8分 → 1分に短縮)
      
      return () => {
        clearInterval(intervalId);
      };
    } else if (!status.loading) {
      // 接続失敗時は30秒ごとに自動再試行
      const retryId = setTimeout(() => {
        if (isMounted.current && !checkingConnection.current) {
          checkConnection();
        }
      }, 30 * 1000);
      
      return () => {
        clearTimeout(retryId);
      };
    }
  }, [status.connected, status.loading, checkConnection]);

  // パフォーマンスマーク - 初期化完了
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('api_context_init_complete');
      window.performance.measure('api_context_initialization', 'api_context_init_start', 'api_context_init_complete');
    }
  }, []);

  return (
    <ApiContext.Provider value={{ status, reconnectAttempts, checkConnection, resetConnection }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};