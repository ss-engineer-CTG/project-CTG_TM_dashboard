import axios from 'axios';
import { DashboardMetrics, Project, FileResponse, RecentTasks } from './types';

// APIクライアントのベース設定
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// プロジェクト一覧の取得
export const getProjects = async (filePath?: string): Promise<Project[]> => {
  const { data } = await apiClient.get<Project[]>('/projects', {
    params: { file_path: filePath }
  });
  return data;
};

// プロジェクト詳細の取得
export const getProject = async (projectId: string, filePath?: string): Promise<Project> => {
  const { data } = await apiClient.get<Project>(`/projects/${projectId}`, {
    params: { file_path: filePath }
  });
  return data;
};

// プロジェクトの直近タスク情報を取得
export const getRecentTasks = async (projectId: string, filePath?: string): Promise<RecentTasks> => {
  const { data } = await apiClient.get<RecentTasks>(`/projects/${projectId}/recent-tasks`, {
    params: { file_path: filePath }
  });
  return data;
};

// ダッシュボードメトリクスの取得
export const getMetrics = async (filePath?: string): Promise<DashboardMetrics> => {
  const { data } = await apiClient.get<DashboardMetrics>('/metrics', {
    params: { file_path: filePath }
  });
  return data;
};

// デフォルトファイルパスの取得
export const getDefaultPath = async (): Promise<FileResponse> => {
  const { data } = await apiClient.get<FileResponse>('/files/default-path');
  return data;
};

// ファイルを開く
export const openFile = async (path: string): Promise<FileResponse> => {
  const { data } = await apiClient.post<FileResponse>('/files/open', { path });
  return data;
};

// ファイル選択ダイアログを表示する
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  const { data } = await apiClient.get<FileResponse>('/files/select', {
    params: { initial_path: initialPath }
  });
  return data;
};

// APIの健全性をチェック
export const healthCheck = async (): Promise<any> => {
  // 修正: 正しいAPIパスを使用
  const { data } = await apiClient.get('/health');
  return data;
};

// バックエンドのシャットダウンをリクエスト
export const requestShutdown = async (): Promise<any> => {
  // 修正: 正しいAPIパスを使用
  const { data } = await apiClient.post('/shutdown');
  return data;
};