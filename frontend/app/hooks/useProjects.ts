'use client';

import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getProjects, getMetrics, openFile } from '@/app/lib/api';
import { Project, DashboardMetrics, FileResponse } from '@/app/lib/types';
import { useNotification } from '@/app/contexts/NotificationContext';

export const useProjects = (filePath?: string) => {
  const queryClient = useQueryClient();
  const { addNotification } = useNotification();

  // プロジェクト一覧の取得
  const { 
    data: projects, 
    isLoading: isLoadingProjects, 
    error: projectsError,
    refetch: refetchProjects 
  } = useQuery<Project[], Error>(
    ['projects', filePath], 
    () => getProjects(filePath),
    { 
      staleTime: 1000 * 60 * 5, // 5分間キャッシュ
      onError: (error) => {
        addNotification(`プロジェクトデータの取得に失敗しました: ${error.message}`, 'error');
      }
    }
  );

  // ダッシュボードメトリクスの取得
  const { 
    data: metrics, 
    isLoading: isLoadingMetrics, 
    error: metricsError,
    refetch: refetchMetrics
  } = useQuery<DashboardMetrics, Error>(
    ['metrics', filePath], 
    () => getMetrics(filePath),
    { 
      staleTime: 1000 * 60 * 5, // 5分間キャッシュ
      onError: (error) => {
        addNotification(`メトリクスの取得に失敗しました: ${error.message}`, 'error');
      }
    }
  );

  // ファイルを開くミューテーション
  const { mutate: openFileMutation } = useMutation<FileResponse, Error, string>(
    (path) => openFile(path),
    {
      onSuccess: (data) => {
        addNotification(data.message, data.success ? 'success' : 'error');
      },
      onError: (error) => {
        addNotification(`ファイルを開くことができませんでした: ${error.message}`, 'error');
      }
    }
  );

  // データの更新
  const refreshData = async () => {
    try {
      await Promise.all([
        refetchProjects(),
        refetchMetrics()
      ]);
      addNotification('データを更新しました', 'success');
    } catch (error) {
      addNotification('データの更新に失敗しました', 'error');
    }
  };

  return {
    projects,
    metrics,
    isLoading: isLoadingProjects || isLoadingMetrics,
    error: projectsError || metricsError,
    refreshData,
    openFile: openFileMutation
  };
};