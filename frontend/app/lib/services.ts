import { apiClient } from './client';
import { Project, DashboardMetrics, FileResponse, RecentTasks, HealthResponse } from './types';

// 安全なクライアントサイドチェック
const isClient = typeof window !== 'undefined';

// API要求キャッシュ - 同一リクエストの重複実行防止用
const requestCache = new Map<string, {
  promise: Promise<any>;
  timestamp: number;
}>();

// APIが初期化されていることを確認する高階関数 - 最適化版
const withApiInitialized = async <T>(fn: () => Promise<T>, cacheKey?: string, cacheTTL: number = 5000): Promise<T> => {
  // キャッシュキーがある場合は過去のリクエストを確認
  if (cacheKey && requestCache.has(cacheKey)) {
    const cachedRequest = requestCache.get(cacheKey)!;
    const now = Date.now();
    
    // 指定されたTTL内ならキャッシュを返す
    if (now - cachedRequest.timestamp < cacheTTL) {
      return cachedRequest.promise;
    }
  }
  
  // 新しいリクエストを生成
  const promise = fn();
  
  // キャッシュキーがある場合はリクエストをキャッシュ
  if (cacheKey) {
    requestCache.set(cacheKey, {
      promise,
      timestamp: Date.now()
    });
    
    // キャッシュサイズの管理（最大50エントリに制限）
    if (requestCache.size > 50) {
      // 最も古いエントリを削除
      const oldestKey = Array.from(requestCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      requestCache.delete(oldestKey);
    }
  }
  
  return promise;
};

// プロジェクト一覧とメトリクスを一度に取得（最適化）
export const getInitialData = async (filePath: string): Promise<{
  projects?: Project[],
  metrics?: DashboardMetrics,
  error?: any
}> => {
  return withApiInitialized(async () => {
    try {
      // メトリクスとプロジェクトデータを並列に取得
      const [metricsData, projectsData] = await Promise.allSettled([
        apiClient.get<DashboardMetrics>('/metrics', { file_path: filePath }, { timeout: 8000 }),
        apiClient.get<Project[]>('/projects', { file_path: filePath }, { timeout: 8000 })
      ]);
      
      const result: any = {};
      
      // 成功したデータのみを返す
      if (metricsData.status === 'fulfilled') {
        result.metrics = metricsData.value;
      }
      
      if (projectsData.status === 'fulfilled') {
        result.projects = projectsData.value;
      }
      
      // エラーがあれば最初のエラーを設定
      if (metricsData.status === 'rejected' && projectsData.status === 'rejected') {
        result.error = metricsData.reason;
      }
      
      return result;
    } catch (error: any) {
      return { error };
    }
  }, `initial_data_${filePath}`, 2000); // 2秒キャッシュ
};

// プロジェクト一覧の取得
export const getProjects = async (filePath?: string): Promise<Project[]> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<Project[]>(
      '/projects',
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `projects_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// プロジェクト詳細の取得
export const getProject = async (projectId: string, filePath?: string): Promise<Project> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<Project>(
      `/projects/${projectId}`,
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `project_${projectId}_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// プロジェクトの直近タスク情報を取得
export const getRecentTasks = async (projectId: string, filePath?: string): Promise<RecentTasks> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<RecentTasks>(
      `/projects/${projectId}/recent-tasks`,
      { file_path: filePath },
      { timeout: 5000 }
    );
    return data;
  }, `recent_tasks_${projectId}_${filePath || 'default'}`, 10000); // 10秒キャッシュ
};

// ダッシュボードメトリクスの取得
export const getMetrics = async (filePath?: string): Promise<DashboardMetrics> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<DashboardMetrics>(
      '/metrics',
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `metrics_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// デフォルトファイルパスの取得
export const getDefaultPath = async (): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // ローカルストレージから前回のパスをチェック
      if (isClient) {
        try {
          const lastPath = localStorage.getItem('lastSelectedPath');
          if (lastPath) {
            return {
              success: true,
              message: '前回のファイルパスを使用します',
              path: lastPath
            };
          }
        } catch (e) {
          // ローカルストレージエラーは無視
        }
      }
      
      // APIから取得
      const data = await apiClient.get<FileResponse>('/files/default-path', undefined, { timeout: 5000 });
      return data;
    } catch (error: any) {
      // エラーが発生してもFileResponse形式で返す
      return {
        success: false,
        message: error.isApiError 
          ? `デフォルトパス取得エラー: ${error.details}` 
          : `デフォルトパス取得中に予期しないエラーが発生しました: ${error.message}`
      };
    }
  }, 'default_path', 10000); // 10秒キャッシュ
};

// ファイルを開く
export const openFile = async (path: string): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // Electronの場合はfs.openPathを使用
      if (typeof window !== 'undefined' && window.electron?.fs) {
        try {
          const electron = window.electron;
          
          // パスの検証
          const validation = await electron.fs.validatePath(path);
          
          // パスが存在しない場合
          if (!validation.exists) {
            return {
              success: false,
              message: `ファイルが見つかりません: ${path}`,
              path
            };
          }
          
          // ファイルまたはフォルダを開く
          const result = await electron.fs.openPath(path);
          
          if (result.success) {
            return {
              success: true,
              message: validation.type === 'directory' ? 
                `フォルダを開きました: ${path}` : 
                `ファイルを開きました: ${path}`,
              path
            };
          } else {
            return {
              success: false,
              message: `${validation.type === 'directory' ? 'フォルダ' : 'ファイル'}を開けませんでした: ${result.message || '不明なエラー'}`,
              path
            };
          }
        } catch (e) {
          // Electron APIエラー
          console.error(`Electronでのファイルオープンエラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
      
      // API経由でファイルを開く
      const data = await apiClient.post<FileResponse>('/files/open', { path }, undefined, { timeout: 8000 });
      return data;
    } catch (error: any) {
      // エラーが発生してもFileResponse形式で返す
      return {
        success: false,
        message: error.isApiError
          ? `ファイルを開くエラー: ${error.details}`
          : `ファイルを開く際に予期しないエラーが発生しました: ${error.message}`
      };
    }
  });
};

// ファイル選択ダイアログを表示する
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // Electron環境チェック
      if (typeof window !== 'undefined' && window.electron?.dialog?.openCSVFile) {
        try {
          const electron = window.electron;
          
          // TypeScriptのための追加チェック - dialogプロパティの存在を確認
          if (!electron.dialog) {
            throw new Error('Electron dialog API is not available');
          }
          
          // Electron経由でファイル選択
          const result = await electron.dialog.openCSVFile(initialPath || '');
          return {
            success: result.success,
            message: result.message,
            path: result.path || undefined
          };
        } catch (dialogError) {
          console.warn(`Electronダイアログエラー: ${dialogError instanceof Error ? dialogError.message : String(dialogError)}`);
        }
      }
      
      // API経由でファイル選択（フォールバック）
      const data = await apiClient.get<FileResponse>(
        '/files/select',
        { initial_path: initialPath },
        { timeout: 15000 }
      );
      return data;
    } catch (error: any) {
      return {
        success: false,
        message: error.isApiError
          ? `ファイル選択エラー: ${error.details}`
          : `ファイル選択中に予期しないエラーが発生しました: ${error.message}`
      };
    }
  });
};

// API健全性チェック
export const healthCheck = async (): Promise<HealthResponse> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<HealthResponse>('/health', undefined, { timeout: 5000 });
    return data;
  });
};

// キャッシュ管理 - リクエストキャッシュをクリア
export const clearRequestCache = (): void => {
  requestCache.clear();
};

export * from './client';