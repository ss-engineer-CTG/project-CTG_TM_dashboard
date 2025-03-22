'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Notification } from '@/app/lib/types';
import { v4 as uuidv4 } from 'uuid';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning', duration?: number) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

/**
 * 通知システムを提供するコンテキストプロバイダー
 */
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  // 通知を追加する関数
  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000) => {
    const id = uuidv4();
    
    // 通知を追加
    setNotifications(prev => [...prev, { id, message, type, duration }]);

    // 自動的に通知を削除するタイマーを設定
    if (duration > 0) {
      timeoutsRef.current[id] = setTimeout(() => {
        removeNotification(id);
        delete timeoutsRef.current[id];
      }, duration);
    }
  }, []);

  // 通知を削除する関数
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
    
    // タイマーが存在する場合はクリア
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

/**
 * 通知コンテキストを使用するためのフック
 */
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};