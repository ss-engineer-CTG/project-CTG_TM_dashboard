'use client';

import { useState, useEffect, useCallback } from 'react';
import { Project, DashboardMetrics, APIConnectionStatus, ErrorInfo } from '../lib/types';
import { getProjects, getMetrics, openFile } from '../lib/services';
import { testApiConnection } from '../lib/connection';
import { useNotification } from '../contexts/NotificationContext';
import { useApi } from '../contexts/ApiContext';

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
  const [error, setError] = useState<ErrorInfo | null>(null);
  const { addNotification } = useNotification();
  
  // APIコンテキストを使用
  const { status: apiStatus, reconnectAttempts, checkConnection: checkApiConnection } = useApi();

  // データ取得関数
  const fetchData = useCallback(async () => {
    if (!isClient) return;
    if (!filePath) {
      addNotification('ファイルが選択されていません', 'error');
      return;
    }
    
    // API接続確認
    if (!apiStatus.connected) {
      const isConnected = await checkApiConnection();
      if (!isConnected) return;
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
  }, [filePath, addNotification, apiStatus.connected, checkApiConnection]);

  // ファイルパスが変更されたら自動的にデータを再取得
  useEffect(() => {
    if (!isClient) return;
    
    if (filePath && apiStatus.connected) {
      fetchData();
    }
  }, [filePath, fetchData, apiStatus.connected]);

  // データ更新関数
  const refreshData = useCallback(async () => {
    if (!isClient) return;
    if (!filePath) {
      addNotification('ファイルが選択されていません', 'error');
      return;
    }

    try {
      await fetchData();
      if (!error) {
        addNotification('データが更新されました', 'success');
      }
    } catch (e) {
      console.error("データ更新エラー:", e);
    }
  }, [filePath, fetchData, addNotification, error]);

  // ファイルを開く関数
  const handleOpenFile = useCallback(async (path: string) => {
    if (!isClient) return;
    
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