import { apiClient } from './client';
import { initializeApi } from './connection';
import { Project, DashboardMetrics, FileResponse, RecentTasks, HealthResponse, ShutdownResponse } from './types';
import { isClient, isElectronEnvironment, getApiInitialized } from './utils/environment';

// APIが初期化されていることを確認する高階関数
const withApiInitialized = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (!isClient) {
    throw new Error('This function can only be called in client-side code');
  }
  
  // API初期化状態を確認
  if (!getApiInitialized()) {
    await initializeApi();
  }
  
  // API呼び出しを実行
  return fn();
};

// プロジェクト一覧の取得
export const getProjects = async (filePath?: string): Promise<Project[]> => {
  return withApiInitialized(async () => {
    try {
      console.log(`プロジェクト一覧取得中... filePath: ${filePath || 'なし'}`);
      const data = await apiClient.get<Project[]>('/projects', { file_path: filePath });
      console.log(`プロジェクト一覧取得成功: ${data.length}件`);
      return data;
    } catch (error: any) {
      console.error('プロジェクト一覧取得失敗:', error);
      throw error;
    }
  });
};

// プロジェクト詳細の取得
export const getProject = async (projectId: string, filePath?: string): Promise<Project> => {
  return withApiInitialized(async () => {
    try {
      console.log(`プロジェクト詳細取得中... projectId: ${projectId}, filePath: ${filePath || 'なし'}`);
      const data = await apiClient.get<Project>(`/projects/${projectId}`, { file_path: filePath });
      console.log(`プロジェクト詳細取得成功: ${data.project_name}`);
      return data;
    } catch (error: any) {
      console.error('プロジェクト詳細取得失敗:', error);
      throw error;
    }
  });
};

// プロジェクトの直近タスク情報を取得
export const getRecentTasks = async (projectId: string, filePath?: string): Promise<RecentTasks> => {
  return withApiInitialized(async () => {
    try {
      console.log(`最近のタスク取得中... projectId: ${projectId}, filePath: ${filePath || 'なし'}`);
      const data = await apiClient.get<RecentTasks>(`/projects/${projectId}/recent-tasks`, { file_path: filePath });
      console.log('最近のタスク取得成功');
      return data;
    } catch (error: any) {
      console.error('最近のタスク取得失敗:', error);
      throw error;
    }
  });
};

// ダッシュボードメトリクスの取得
export const getMetrics = async (filePath?: string): Promise<DashboardMetrics> => {
  return withApiInitialized(async () => {
    try {
      console.log(`メトリクス取得中... filePath: ${filePath || 'なし'}`);
      const data = await apiClient.get<DashboardMetrics>('/metrics', { file_path: filePath });
      console.log('メトリクス取得成功');
      return data;
    } catch (error: any) {
      console.error('メトリクス取得失敗:', error);
      throw error;
    }
  });
};

// デフォルトファイルパスの取得
export const getDefaultPath = async (): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      console.log('デフォルトファイルパス取得中...');
      const data = await apiClient.get<FileResponse>('/files/default-path');
      console.log(`デフォルトファイルパス取得成功: ${data.path || 'パスなし'}`);
      return data;
    } catch (error: any) {
      console.error('デフォルトファイルパス取得失敗:', error);
      
      // エラーが発生してもFileResponse形式で返す
      return {
        success: false,
        message: error.isApiError 
          ? `デフォルトパス取得エラー: ${error.details}` 
          : `デフォルトパス取得中に予期しないエラーが発生しました: ${error.message}`,
        path: null
      };
    }
  });
};

// ファイルを開く
export const openFile = async (path: string): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      console.log(`ファイルを開く... path: ${path}`);
      const data = await apiClient.post<FileResponse>('/files/open', { path });
      console.log(`ファイルを開く成功: ${data.success ? '成功' : '失敗'}`);
      return data;
    } catch (error: any) {
      console.error('ファイルを開く失敗:', error);
      
      // エラーが発生してもFileResponse形式で返す
      return {
        success: false,
        message: error.isApiError
          ? `ファイルを開くエラー: ${error.details}`
          : `ファイルを開く際に予期しないエラーが発生しました: ${error.message}`,
        path: null
      };
    }
  });
};

// ファイル選択ダイアログを表示する
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  console.log('selectFile: 関数が呼び出されました', { initialPath });

  if (!isClient) {
    console.log('selectFile: クライアントサイドではありません');
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です',
      path: null
    };
  }
  
  try {
    console.log('selectFile: 環境を検証します');
    
    // 環境変数検証
    const env = {
      isClient: isClient,
      isElectron: isElectronEnvironment(),
      hasElectronObj: typeof window.electron !== 'undefined',
      hasDialogObj: typeof window.electron?.dialog !== 'undefined',
      hasOpenCSVMethod: typeof window.electron?.dialog?.openCSVFile === 'function',
      nodeEnv: process.env.NODE_ENV
    };
    
    console.log('selectFile: 環境変数:', env);
    
    // 実際にどの選択経路を使用するかをログ出力
    let selectedPath = 'unknown';
    
    // Electron環境かどうかをチェック
    if (env.isElectron && env.hasOpenCSVMethod) {
      selectedPath = 'electron';
      console.log('selectFile: Electron対応ファイル選択を使用します');
      try {
        // Electron経由でファイル選択
        console.log('selectFile: window.electron.dialog.openCSVFile を呼び出します');
        const result = await window.electron.dialog.openCSVFile(initialPath || '');
        console.log('selectFile: Electron選択結果:', result);
        return result;
      } catch (dialogError) {
        console.error('selectFile: Electronダイアログエラー:', dialogError);
        throw dialogError;
      }
    } else {
      selectedPath = 'api';
      console.log('selectFile: APIベースのファイル選択を使用します');
      
      // API経由でファイル選択
      return await withApiInitialized(async () => {
        console.log('selectFile: APIリクエスト開始: /files/select');
        const data = await apiClient.get<FileResponse>('/files/select', { 
          initial_path: initialPath 
        });
        console.log('selectFile: API選択結果:', data);
        return data;
      });
    }
  } catch (error: any) {
    console.error('selectFile: エラー発生:', error);
    
    return {
      success: false,
      message: error.isApiError
        ? `ファイル選択エラー: ${error.details}`
        : `ファイル選択中に予期しないエラーが発生しました: ${error.message}`,
      path: null
    };
  }
};

// API健全性チェック
export const healthCheck = async (): Promise<HealthResponse> => {
  return withApiInitialized(async () => {
    try {
      console.log('APIヘルスチェック実行中...');
      const data = await apiClient.get<HealthResponse>('/health');
      console.log('APIヘルスチェック成功:', data);
      return data;
    } catch (error: any) {
      console.error('APIヘルスチェック失敗:', error);
      throw error;
    }
  });
};

// バックエンドのシャットダウンをリクエスト
export const requestShutdown = async (): Promise<ShutdownResponse> => {
  return withApiInitialized(async () => {
    try {
      console.log('APIシャットダウンリクエスト実行中...');
      const data = await apiClient.post<ShutdownResponse>('/shutdown');
      console.log('APIシャットダウンリクエスト成功:', data);
      return data;
    } catch (error: any) {
      console.error('APIシャットダウンリクエスト失敗:', error);
      throw error;
    }
  });
};

// API接続テスト
export const testApiConnection = async (): Promise<{success: boolean; message: string; details?: any}> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ実行可能な機能です'
    };
  }
  
  try {
    console.log('API接続テスト実行中...');
    const response = await healthCheck();
    
    return {
      success: true,
      message: `APIサーバーに接続しました: ${response.status || 'OK'}`,
      details: response
    };
  } catch (error: any) {
    console.error('API接続テスト失敗:', error);
    
    return {
      success: false,
      message: error.isApiError
        ? `接続エラー: ${error.details}`
        : `API接続テスト中に予期しないエラーが発生しました: ${error.message}`,
      details: error
    };
  }
};

export * from './client';
export * from './connection';