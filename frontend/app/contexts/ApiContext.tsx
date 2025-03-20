'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { APIConnectionStatus } from '../lib/types';
import { testApiConnection } from '../lib/connection';
import { useNotification } from './NotificationContext';

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

  // API接続確認
  const checkConnection = useCallback(async (retryDelay: number = 0) => {
    // クライアントサイドでのみ実行
    if (typeof window === 'undefined') return false;
    
    setStatus(prev => ({ ...prev, loading: true }));
    
    if (retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    try {
      const result = await testApiConnection();
      
      setStatus({
        connected: result.success,
        loading: false,
        message: result.message,
        lastChecked: new Date(),
        details: result.details
      });
      
      if (result.success) {
        if (reconnectAttempts > 0) {
          addNotification('バックエンドサーバーへの接続が回復しました', 'success');
        }
        setReconnectAttempts(0);
      } else {
        setReconnectAttempts(prev => prev + 1);
        addNotification(result.message, 'error');
      }
      
      return result.success;
    } catch (error: any) {
      console.error('API接続確認エラー:', error);
      
      setStatus({
        connected: false,
        loading: false,
        message: `API接続エラー: ${error.message}`,
        lastChecked: new Date()
      });
      
      setReconnectAttempts(prev => prev + 1);
      addNotification('APIサーバーへの接続に失敗しました', 'error');
      return false;
    }
  }, [addNotification, reconnectAttempts]);

  // 初期接続確認
  useEffect(() => {
    // クライアントサイドでのみ実行
    if (typeof window === 'undefined') return;
    
    checkConnection();
    
    // 定期的に接続を確認
    const intervalId = setInterval(() => {
      checkConnection();
    }, 5 * 60 * 1000); // 5分ごと
    
    return () => clearInterval(intervalId);
  }, [checkConnection]);

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