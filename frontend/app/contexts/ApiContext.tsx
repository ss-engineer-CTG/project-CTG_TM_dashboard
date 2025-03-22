'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { APIConnectionStatus } from '../lib/types';
// インポートパスを変更
import { testApiConnection } from '../lib/api-init';
import { useNotification } from './NotificationContext';

// パフォーマンス測定
if (typeof window !== 'undefined') {
  window.performance.mark('api_context_init_start');
}

interface ApiContextType {
  status: APIConnectionStatus;
  reconnectAttempts: number;
  checkConnection: (retryDelay?: number) => Promise<boolean>;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<APIConnectionStatus>({
    connected: false,
    loading: true,
    message: 'API接続確認中...',
    lastChecked: null
  });
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const { addNotification } = useNotification();
  
  // 最適化: isMountedの参照を使用して、アンマウント後の状態更新を防止
  const isMounted = useRef(true);
  const lastConnectionTime = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      // タイムアウトのクリーンアップ
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  // 改善されたAPI接続確認関数 - 再試行と遅延戦略を含む
  const checkConnection = useCallback(async (retryDelay: number = 0, maxRetries: number = 3): Promise<boolean> => {
    if (!isMounted.current) return false;
    
    // 過度に頻繁な接続チェックを防止（少なくとも500ms間隔を空ける）
    const now = Date.now();
    if (lastConnectionTime.current && now - lastConnectionTime.current < 800) { // 間隔拡大：500ms→800ms
      return status.connected;
    }
    lastConnectionTime.current = now;
    
    // パフォーマンスマーク
    if (typeof window !== 'undefined') {
      window.performance.mark('connection_check_start');
    }
    
    setStatus(prev => ({ ...prev, loading: true }));
    
    if (retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        const result = await testApiConnection();
        
        if (!isMounted.current) return false;
        
        if (result.success) {
          setStatus({
            connected: true,
            loading: false,
            message: result.message || 'APIサーバーに接続しました',
            lastChecked: new Date(),
            details: result.details
          });
          
          if (reconnectAttempts > 0) {
            addNotification('バックエンドサーバーへの接続が回復しました', 'success');
          }
          setReconnectAttempts(0);
          
          // パフォーマンスマーク - 成功
          if (typeof window !== 'undefined') {
            window.performance.mark('connection_check_complete');
            window.performance.measure('connection_check_duration', 'connection_check_start', 'connection_check_complete');
          }
          
          return true;
        }
        
        lastError = result;
        break;
      } catch (error: any) {
        lastError = error;
        
        if (retryCount < maxRetries) {
          // 指数バックオフ再試行（0.5秒、1秒、2秒...）
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 500));
          retryCount++;
        } else {
          break;
        }
      }
    }
    
    // すべての再試行が失敗した場合
    if (!isMounted.current) return false;
    
    setStatus({
      connected: false,
      loading: false,
      message: lastError?.message || 'APIサーバーへの接続に失敗しました',
      lastChecked: new Date(),
      details: lastError?.details
    });
    
    setReconnectAttempts(prev => prev + 1);
    if (reconnectAttempts < 3) {
      addNotification(lastError?.message || 'APIサーバーへの接続に失敗しました', 'error');
    }
    
    // パフォーマンスマーク - エラー
    if (typeof window !== 'undefined') {
      window.performance.mark('connection_check_error');
      window.performance.measure('connection_check_error_duration', 'connection_check_start', 'connection_check_error');
    }
    
    return false;
  }, [addNotification, reconnectAttempts, status.connected]);

  // 初期接続確認 - 最適化版（複数回の再試行を含む）
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
          message: 'API接続タイムアウト。再試行してください。'
        }));
      }
    }, 15000); // 延長：10秒→15秒タイムアウト
    
    const initializeConnection = async () => {
      // 複数回再試行を含む接続確認
      await checkConnection(0, 3); // 最大3回再試行
      
      // パフォーマンスマーク
      if (typeof window !== 'undefined' && isMounted.current) {
        window.performance.mark('initial_connection_check_complete');
        window.performance.measure(
          'initial_connection_check_duration',
          'initial_connection_check_start',
          'initial_connection_check_complete'
        );
      }
      
      // 接続成功時は定期的なチェックを設定
      if (isMounted.current && status.connected) {
        // 定期的に接続を確認 - 間隔を8分に拡大（負荷軽減）
        const intervalId = setInterval(() => {
          if (isMounted.current) {
            checkConnection();
          }
        }, 8 * 60 * 1000); // 8分ごと
        
        return () => {
          clearInterval(intervalId);
        };
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
  }, [checkConnection, status.connected, status.loading]);

  // パフォーマンスマーク - 初期化完了
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('api_context_init_complete');
      window.performance.measure('api_context_initialization', 'api_context_init_start', 'api_context_init_complete');
    }
  }, []);

  return (
    <ApiContext.Provider value={{ status, reconnectAttempts, checkConnection }}>
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