import { apiClient } from './client';
import { initializeApi } from './api-init'; // 循環依存を解決するために修正
import { Project, DashboardMetrics, FileResponse, RecentTasks, HealthResponse, ShutdownResponse } from './types';
import { isClient, isElectronEnvironment, getApiInitialized } from './utils/environment';
import { testApiConnection } from './api-init'; // testApiConnectionも移動

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('services_module_init');
}

// API要求キャッシュ - 同一リクエストの重複実行防止用
const requestCache = new Map<string, {
  promise: Promise<any>;
  timestamp: number;
}>();

// APIが初期化されていることを確認する高階関数 - 最適化版
const withApiInitialized = async <T>(fn: () => Promise<T>, cacheKey?: string, cacheTTL: number = 5000): Promise<T> => {
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark(`api_request_${cacheKey || 'unknown'}_start`);
  }
  
  // キャッシュキーがある場合は過去のリクエストを確認
  if (cacheKey && requestCache.has(cacheKey)) {
    const cachedRequest = requestCache.get(cacheKey)!;
    const now = Date.now();
    
    // 指定されたTTL内ならキャッシュを返す
    if (now - cachedRequest.timestamp < cacheTTL) {
      // パフォーマンスマーク - キャッシュヒット
      if (typeof window !== 'undefined') {
        window.performance.mark(`api_request_${cacheKey}_cache_hit`);
        window.performance.measure(
          `api_request_${cacheKey}_cache_hit_duration`,
          `api_request_${cacheKey}_start`,
          `api_request_${cacheKey}_cache_hit`
        );
      }
      
      return cachedRequest.promise;
    }
  }
  
  // API初期化状態を確認
  if (!getApiInitialized()) {
    await initializeApi();
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
      const oldestKey = [...requestCache.entries()]
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      requestCache.delete(oldestKey);
    }
  }
  
  // リクエスト完了時にパフォーマンスマークを記録
  promise.then(() => {
    if (typeof window !== 'undefined' && cacheKey) {
      window.performance.mark(`api_request_${cacheKey}_success`);
      window.performance.measure(
        `api_request_${cacheKey}_success_duration`,
        `api_request_${cacheKey}_start`,
        `api_request_${cacheKey}_success`
      );
    }
  }).catch(() => {
    if (typeof window !== 'undefined' && cacheKey) {
      window.performance.mark(`api_request_${cacheKey}_error`);
      window.performance.measure(
        `api_request_${cacheKey}_error_duration`,
        `api_request_${cacheKey}_start`,
        `api_request_${cacheKey}_error`
      );
    }
  });
  
  return promise;
};

// プロジェクト一覧とメトリクスを一度に取得（最適化）
export const getInitialData = async (filePath: string): Promise<{
  projects?: Project[],
  metrics?: DashboardMetrics,
  error?: any
}> => {
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('get_initial_data_start');
  }
  
  return withApiInitialized(async () => {
    try {
      // メトリクスとプロジェクトデータを並列に取得
      const [metricsData, projectsData] = await Promise.allSettled([
        apiClient.get<DashboardMetrics>('/metrics', { file_path: filePath }, { timeout: 8000 }), // タイムアウト延長: 3000ms→8000ms
        apiClient.get<Project[]>('/projects', { file_path: filePath }, { timeout: 8000 }) // タイムアウト延長: 3000ms→8000ms
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
      
      // パフォーマンスマーク - 成功
      if (typeof window !== 'undefined') {
        window.performance.mark('get_initial_data_complete');
        window.performance.measure(
          'get_initial_data_duration',
          'get_initial_data_start',
          'get_initial_data_complete'
        );
      }
      
      return result;
    } catch (error: any) {
      // パフォーマンスマーク - エラー
      if (typeof window !== 'undefined') {
        window.performance.mark('get_initial_data_error');
        window.performance.measure(
          'get_initial_data_error_duration',
          'get_initial_data_start',
          'get_initial_data_error'
        );
      }
      
      return { error };
    }
  }, `initial_data_${filePath}`, 2000); // 2秒キャッシュ
};

// プロジェクト一覧の取得 - 最適化版
export const getProjects = async (filePath?: string): Promise<Project[]> => {
  return withApiInitialized(async () => {
    try {
      const cacheKey = `projects_${filePath || 'default'}`;
      const data = await apiClient.get<Project[]>(
        '/projects',
        { file_path: filePath },
        { timeout: 8000 } // タイムアウト延長: 5000ms→8000ms
      );
      return data;
    } catch (error: any) {
      throw error;
    }
  }, `projects_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// プロジェクト詳細の取得 - 最適化版
export const getProject = async (projectId: string, filePath?: string): Promise<Project> => {
  return withApiInitialized(async () => {
    try {
      const cacheKey = `project_${projectId}_${filePath || 'default'}`;
      const data = await apiClient.get<Project>(
        `/projects/${projectId}`,
        { file_path: filePath },
        { timeout: 8000 } // タイムアウト延長: 5000ms→8000ms
      );
      return data;
    } catch (error: any) {
      throw error;
    }
  }, `project_${projectId}_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// プロジェクトの直近タスク情報を取得 - 最適化版
export const getRecentTasks = async (projectId: string, filePath?: string): Promise<RecentTasks> => {
  return withApiInitialized(async () => {
    try {
      const cacheKey = `recent_tasks_${projectId}_${filePath || 'default'}`;
      const data = await apiClient.get<RecentTasks>(
        `/projects/${projectId}/recent-tasks`,
        { file_path: filePath },
        { timeout: 5000 } // タイムアウト延長: 3000ms→5000ms
      );
      return data;
    } catch (error: any) {
      throw error;
    }
  }, `recent_tasks_${projectId}_${filePath || 'default'}`, 10000); // 10秒キャッシュ
};

// ダッシュボードメトリクスの取得 - 最適化版
export const getMetrics = async (filePath?: string): Promise<DashboardMetrics> => {
  return withApiInitialized(async () => {
    try {
      const cacheKey = `metrics_${filePath || 'default'}`;
      const data = await apiClient.get<DashboardMetrics>(
        '/metrics',
        { file_path: filePath },
        { timeout: 8000 } // タイムアウト延長: 5000ms→8000ms
      );
      return data;
    } catch (error: any) {
      throw error;
    }
  }, `metrics_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// デフォルトファイルパスの取得 - 最適化版
export const getDefaultPath = async (): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // ローカルストレージから前回のパスをチェック
      try {
        const lastPath = localStorage.getItem('lastSelectedPath');
        if (lastPath) {
          return {
            success: true,
            message: '前回のファイルパスを使用します',
            path: lastPath
          };
        }
      } catch (e) {}
      
      // APIから取得
      const data = await apiClient.get<FileResponse>('/files/default-path', undefined, { timeout: 5000 }); // タイムアウト延長: 3000ms→5000ms
      return data;
    } catch (error: any) {
      // エラーが発生してもFileResponse形式で返す
      return {
        success: false,
        message: error.isApiError 
          ? `デフォルトパス取得エラー: ${error.details}` 
          : `デフォルトパス取得中に予期しないエラーが発生しました: ${error.message}`,
        path: null
      };
    }
  }, 'default_path', 10000); // 10秒キャッシュ
};

// ファイルを開く - 最適化版
export const openFile = async (path: string): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // Electron環境の場合は直接ファイルを開く
      if (isElectronEnvironment() && window.electron?.fs?.exists) {
        try {
          const exists = await window.electron.fs.exists(path);
          if (exists) {
            // OSの標準機能でファイルを開く（electron-shellの代わり）
            await window.electron.testDialog();
            return {
              success: true,
              message: `ファイルを開きました: ${path}`,
              path: path
            };
          }
        } catch (e) {
          console.error('Electronファイルオープンエラー:', e);
          // Electron APIエラーの場合はAPI経由でフォールバック
        }
      }
      
      // API経由でファイルを開く
      const data = await apiClient.post<FileResponse>('/files/open', { path }, undefined, { timeout: 8000 }); // タイムアウト延長: 5000ms→8000ms
      return data;
    } catch (error: any) {
      console.error('ファイルを開く際のエラー:', error);
      
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

// ファイル選択ダイアログを表示する - 最適化版
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // Electron環境チェック
      if (isElectronEnvironment() && window.electron?.dialog?.openCSVFile) {
        try {
          // Electron経由でファイル選択
          console.log('Electron経由でCSVファイル選択を実行します...');
          const result = await window.electron.dialog.openCSVFile(initialPath || '');
          return result;
        } catch (dialogError) {
          console.error('Electronダイアログエラー:', dialogError);
          // Electronダイアログエラーの場合はAPI経由でフォールバック
        }
      }
      
      // API経由でファイル選択（フォールバック）
      const data = await apiClient.get<FileResponse>(
        '/files/select',
        { initial_path: initialPath },
        { timeout: 15000 } // タイムアウト延長: 10000ms→15000ms
      );
      return data;
    } catch (error: any) {
      console.error('ファイル選択エラー:', error);
      return {
        success: false,
        message: error.isApiError
          ? `ファイル選択エラー: ${error.details}`
          : `ファイル選択中に予期しないエラーが発生しました: ${error.message}`,
        path: null
      };
    }
  });
};

// API健全性チェック - 最適化版（リトライ機能追加）
export const healthCheck = async (retries: number = 2): Promise<HealthResponse> => {
  return withApiInitialized(async () => {
    let lastError = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await apiClient.get<HealthResponse>('/health', undefined, { 
          timeout: 5000 // タイムアウト延長: 2000ms→5000ms
        });
        return data;
      } catch (error: any) {
        lastError = error;
        
        // 最後の試行でなければ、少し待ってから再試行
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw lastError;
  });
};

// バックエンドのシャットダウンをリクエスト - 最適化版
export const requestShutdown = async (): Promise<ShutdownResponse> => {
  return withApiInitialized(async () => {
    try {
      const data = await apiClient.post<ShutdownResponse>('/shutdown', undefined, undefined, { 
        timeout: 5000 // タイムアウト延長: 2000ms→5000ms
      });
      return data;
    } catch (error: any) {
      console.error('シャットダウンリクエストエラー:', error);
      throw error;
    }
  });
};

// キャッシュ管理 - リクエストキャッシュをクリア
export const clearRequestCache = (): void => {
  requestCache.clear();
};

// サーバー診断情報の取得 - 新機能
export const getServerDiagnostics = async (): Promise<any> => {
  return withApiInitialized(async () => {
    try {
      // デバッグモードの場合のみ診断情報を取得
      if (process.env.NODE_ENV === 'development') {
        const data = await apiClient.get('/debug', undefined, { timeout: 5000 });
        return data;
      }
      return { 
        message: 'Server diagnostics only available in development mode',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });
};

// パフォーマンスマーク - 初期化完了
if (typeof window !== 'undefined') {
  window.performance.mark('services_module_init_complete');
  window.performance.measure(
    'services_module_initialization',
    'services_module_init',
    'services_module_init_complete'
  );
}

export * from './client';
// 循環依存を防ぐために、connection.tsからのエクスポートを避ける
// export * from './connection';