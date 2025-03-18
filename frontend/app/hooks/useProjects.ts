'use client';

import { useState, useEffect, useCallback } from 'react';
import { Project, DashboardMetrics, APIConnectionStatus, ErrorInfo } from '../lib/types';
import { getProjects, getMetrics, openFile, testApiConnection } from '../lib/api';
import { useNotification } from '../contexts/NotificationContext';

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
  const [error, setError] = useState<ErrorInfo | null>(null);
  const { addNotification } = useNotification();

  // API接続をテスト
  const checkApiConnection = useCallback(async () => {
    setApiStatus(prev => ({ ...prev, loading: true }));
    
    try {
      const result = await testApiConnection();
      
      setApiStatus({
        connected: result.success,
        loading: false,
        message: result.message,
        lastChecked: new Date(),
        details: result.details
      });
      
      if (!result.success) {
        console.error('API接続エラー:', result);
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
      
      addNotification('APIサーバーへの接続に失敗しました', 'error');
      return false;
    }
  }, [addNotification]);

  // 初回マウント時にAPI接続をテスト
  useEffect(() => {
    checkApiConnection();
    
    // 定期的に接続をチェック (5分ごと)
    const intervalId = setInterval(() => {
      if (!isLoading) {
        checkApiConnection();
      }
    }, 5 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [checkApiConnection, isLoading]);

  // データ取得関数
  const fetchData = useCallback(async () => {
    if (!filePath) return;
    
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

  // ファイルパスが変更されたら自動的にデータを再取得
  useEffect(() => {
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
    error,
    refreshData,
    openFile: handleOpenFile,
    checkApiConnection
  };
};