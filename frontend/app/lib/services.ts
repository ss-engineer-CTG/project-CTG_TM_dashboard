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

// ブラウザのファイル入力要素を使った選択
const selectFileUsingBrowser = (): Promise<FileResponse> => {
  if (!isClient) {
    return Promise.resolve({
      success: false,
      message: 'ブラウザ環境でのみ使用可能です',
      path: null
    });
  }

  return new Promise((resolve) => {
    // 一時的なファイル入力要素を作成
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    document.body.appendChild(input);

    // ファイル選択イベント
    input.onchange = (event) => {
      const files = (event.target as HTMLInputElement).files;
      
      // 要素を削除
      document.body.removeChild(input);
      
      if (files && files.length > 0) {
        // FileオブジェクトからURLを作成（表示用）
        const file = files[0];
        const fileName = file.name;
        
        // 開発環境ではファイルのパスは取得できないが、名前は取得可能
        resolve({
          success: true,
          message: `ファイルを選択しました: ${fileName}`,
          path: fileName // 本来はパスだが、開発環境ではファイル名のみ
        });
      } else {
        resolve({
          success: false,
          message: 'ファイルが選択されませんでした',
          path: null
        });
      }
    };

    // 古いブラウザで使うキャンセル処理
    const handleWindowClick = () => {
      // ある程度の遅延後にまだ要素が存在するかチェック
      setTimeout(() => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
          window.removeEventListener('click', handleWindowClick);
          resolve({
            success: false,
            message: 'ファイル選択がキャンセルされました',
            path: null
          });
        }
      }, 500);
    };
    
    window.addEventListener('click', handleWindowClick, { once: true });

    // クリックイベントをトリガー
    input.click();
  });
};

// ファイル選択ダイアログを表示する
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です',
      path: null
    };
  }
  
  try {
    // 実際のAPI URLを非同期で取得
    const apiUrl = apiClient.getBaseUrl();
    console.log('[API] ファイル選択ダイアログ表示リクエスト開始', { 
      initialPath: initialPath || 'なし',
      apiUrl: apiUrl
    });
    
    // 開発環境かどうかをチェック
    if (process.env.NODE_ENV === 'development') {
      console.log('[API] 開発環境を検出、ブラウザのファイル選択を使用します');
      return await selectFileUsingBrowser();
    }
    
    // Electron環境かどうかをチェック
    if (isElectronEnvironment() && window.electron?.dialog) {
      console.log('[API] Electron環境を検出、Electronダイアログを使用します');
      return await window.electron.dialog.openCSVFile(initialPath || '');
    }
    
    // それ以外の場合はAPIを使用
    return withApiInitialized(async () => {
      console.log('[API] APIベースのファイル選択を使用します');
      const data = await apiClient.get<FileResponse>('/files/select', { 
        initial_path: initialPath 
      });
      
      return data;
    });
  } catch (error: any) {
    console.error('[API] ファイル選択リクエストエラー:', error);
    
    // エラー発生時はブラウザのファイル選択にフォールバック
    if (isClient) {
      console.log('[API] エラー発生、ブラウザのファイル選択を使用します');
      return await selectFileUsingBrowser();
    }
    
    // フォールバックもできない場合はエラーレスポンスを返す
    return {
      success: false,
      message: error.isApiError
        ? `ファイル選択エラー: ${error.details}`
        : `ファイル選択中に予期しないエラーが発生しました: ${error.message}`,
      path: null
    };
  }
};

// ファイルアップロード
export const uploadCSVFile = async (file: File): Promise<FileResponse> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です',
      path: null
    };
  }
  
  return withApiInitialized(async () => {
    try {
      console.log('[API] CSVファイルアップロード開始');
      
      // FormDataを作成
      const formData = new FormData();
      formData.append('file', file);
      
      // ファイルのアップロード
      const response = await fetch(`${apiClient.getBaseUrl()}/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      console.log('[API] ファイルアップロード成功:', data);
      return data;
    } catch (error: any) {
      console.error('[API] ファイルアップロードエラー:', error);
      return {
        success: false,
        message: error.isApiError
          ? `ファイルアップロードエラー: ${error.details}`
          : `ファイルアップロード中に予期しないエラーが発生しました: ${error.message}`,
        path: null
      };
    }
  });
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

// index.ts ファイルでエクスポートを集約
export * from './client';
export * from './connection';