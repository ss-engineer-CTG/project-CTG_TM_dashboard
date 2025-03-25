'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { APIConnectionStatus } from '../lib/types';
import { healthCheck } from '../lib/services';
import { useNotification } from './NotificationContext';

// APIコンテキスト型定義
interface ApiContextType {
  status: APIConnectionStatus;
  reconnectAttempts: number;
  checkConnection: () => Promise<boolean>;
  resetConnection: () => Promise<boolean>;
}

// APIコンテキスト作成
const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<APIConnectionStatus>({
    connected: false,
    loading: true,
    message: 'API接続確認中...',
    lastChecked: null,
    reconnectAttempts: 0
  });
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const { addNotification } = useNotification();
  
  // マウント状態の管理
  const isMounted = useRef(true);
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

  // Electron IPCイベントリスナーをセットアップ
  useEffect(() => {
    // クライアントサイドでない場合や、window.electronが存在しない場合は早期リターン
    if (typeof window === 'undefined' || !window.electron) return;
    
    // ipcRendererが存在するか確認
    const ipcRenderer = window.electron.ipcRenderer;
    if (!ipcRenderer) return;
    
    // API接続確立イベントのリスナー
    const removeConnectionListener = ipcRenderer.on(
      'api-connection-established',
      (data) => {
        if (!isMounted.current) return;
        
        setStatus({
          connected: true,
          loading: false,
          message: `APIサーバーに接続しました (ポート: ${data.port})`,
          lastChecked: new Date(),
          details: data,
          reconnectAttempts: 0
        });
        
        setReconnectAttempts(0);
      }
    );
    
    // クリーンアップ関数
    return () => {
      if (removeConnectionListener) removeConnectionListener();
    };
  }, []);

  // API接続確認関数
  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!isMounted.current) return false;
    
    // 既に確認中の場合は重複実行を避ける
    if (checkingConnection.current) {
      return status.connected;
    }
    
    checkingConnection.current = true;
    
    // 接続ステータスを更新
    setStatus(prev => ({ ...prev, loading: true }));
    
    try {
      // 健全性チェックを実行
      await healthCheck();
      
      if (!isMounted.current) {
        checkingConnection.current = false;
        return false;
      }
      
      // 成功した場合、ステータスを更新
      setStatus({
        connected: true,
        loading: false,
        message: 'APIサーバーに接続しました',
        lastChecked: new Date(),
        reconnectAttempts: 0
      });
      
      if (reconnectAttempts > 0) {
        addNotification('バックエンドサーバーへの接続が回復しました', 'success');
      }
      
      setReconnectAttempts(0);
      checkingConnection.current = false;
      return true;
    } catch (error: any) {
      if (!isMounted.current) {
        checkingConnection.current = false;
        return false;
      }
      
      // 接続失敗
      const newReconnectAttempts = reconnectAttempts + 1;
      setReconnectAttempts(newReconnectAttempts);
      
      setStatus({
        connected: false,
        loading: false,
        message: 'APIサーバーへの接続に失敗しました',
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

  // 接続リセット機能
  const resetConnection = useCallback(async (): Promise<boolean> => {
    if (!isMounted.current) return false;
    
    setStatus(prev => ({ ...prev, loading: true, message: 'API接続をリセット中...' }));
    
    try {
      // 接続確認を実行
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

  // 初期接続確認
  useEffect(() => {
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
    
    // 初期接続確認
    const initializeConnection = async () => {
      try {
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

  // 接続状態監視 - 定期的なヘルスチェック
  useEffect(() => {
    if (!isMounted.current) return;
    
    // 最初の接続チェックを1秒後に再試行
    if (!status.connected && status.loading) {
      const initialCheckTimer = setTimeout(() => {
        checkConnection();
      }, 1000);
      
      return () => clearTimeout(initialCheckTimer);
    }
    
    // 接続成功時は定期的なチェックを設定
    if (status.connected) {
      const intervalId = setInterval(() => {
        if (isMounted.current && !checkingConnection.current) {
          checkConnection();
        }
      }, 60 * 1000); // 1分ごとにチェック
      
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