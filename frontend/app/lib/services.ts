import { apiClient } from './client';
import { initializeApi } from './api-init'; // 循環依存を解決するために修正
import { Project, DashboardMetrics, FileResponse, RecentTasks, HealthResponse, ShutdownResponse } from './types';
import { isClient, isElectronEnvironment, getApiInitialized } from './utils/environment';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('services_module_init');
}

// ログレベル定義
const LogLevel = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
  DEBUG: 3
};

// 現在のログレベル（環境に応じて設定）
const currentLogLevel = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.WARNING;

// ロガー関数
const logger = {
  error: (message: string) => console.error(`[Services] ${message}`),
  warn: (message: string) => currentLogLevel >= LogLevel.WARNING && console.warn(`[Services] ${message}`),
  info: (message: string) => currentLogLevel >= LogLevel.INFO && console.info(`[Services] ${message}`),
  debug: (message: string) => currentLogLevel >= LogLevel.DEBUG && console.debug(`[Services] ${message}`)
};

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
      logger.debug(`リクエストキャッシュヒット: ${cacheKey}`);
      return cachedRequest.promise;
    }
  }
  
  // API初期化状態を確認 - 一度だけ初期化を実行
  if (!getApiInitialized()) {
    logger.info('APIを初期化中...');
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
  
  logger.info(`初期データ取得開始: ${filePath}`);
  
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
        logger.error(`初期データ取得の両方が失敗: ${metricsData.reason.message}`);
        result.error = metricsData.reason;
      }
      
      logger.info('初期データ取得完了');
      return result;
    } catch (error: any) {
      logger.error(`初期データ取得エラー: ${error.message}`);
      return { error };
    }
  }, `initial_data_${filePath}`, 2000); // 2秒キャッシュ
};

// プロジェクト一覧の取得 - 最適化版
export const getProjects = async (filePath?: string): Promise<Project[]> => {
  return withApiInitialized(async () => {
    logger.debug(`プロジェクト一覧取得: ${filePath || 'デフォルト'}`);
    const data = await apiClient.get<Project[]>(
      '/projects',
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `projects_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// プロジェクト詳細の取得 - 最適化版
export const getProject = async (projectId: string, filePath?: string): Promise<Project> => {
  return withApiInitialized(async () => {
    logger.debug(`プロジェクト詳細取得: ${projectId}, ファイル: ${filePath || 'デフォルト'}`);
    const data = await apiClient.get<Project>(
      `/projects/${projectId}`,
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `project_${projectId}_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// プロジェクトの直近タスク情報を取得 - 最適化版
export const getRecentTasks = async (projectId: string, filePath?: string): Promise<RecentTasks> => {
  return withApiInitialized(async () => {
    logger.debug(`直近タスク情報取得: ${projectId}, ファイル: ${filePath || 'デフォルト'}`);
    const data = await apiClient.get<RecentTasks>(
      `/projects/${projectId}/recent-tasks`,
      { file_path: filePath },
      { timeout: 5000 }
    );
    return data;
  }, `recent_tasks_${projectId}_${filePath || 'default'}`, 10000); // 10秒キャッシュ
};

// ダッシュボードメトリクスの取得 - 最適化版
export const getMetrics = async (filePath?: string): Promise<DashboardMetrics> => {
  return withApiInitialized(async () => {
    logger.debug(`メトリクス取得: ${filePath || 'デフォルト'}`);
    const data = await apiClient.get<DashboardMetrics>(
      '/metrics',
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `metrics_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

// デフォルトファイルパスの取得 - 最適化版
export const getDefaultPath = async (): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      // ローカルストレージから前回のパスをチェック
      if (isClient) {
        try {
          const lastPath = localStorage.getItem('lastSelectedPath');
          if (lastPath) {
            logger.info(`ローカルストレージから前回のパスを使用: ${lastPath}`);
            return {
              success: true,
              message: '前回のファイルパスを使用します',
              path: lastPath
            };
          }
        } catch (e) {
          logger.debug('ローカルストレージからのパス読み込み失敗');
        }
      }
      
      // APIから取得
      logger.debug('デフォルトパスをAPIから取得');
      const data = await apiClient.get<FileResponse>('/files/default-path', undefined, { timeout: 5000 });
      return data;
    } catch (error: any) {
      logger.warn(`デフォルトパス取得エラー: ${error.message}`);
      
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
      logger.debug(`ファイルを開く: ${path}`);
      
      // Electron環境の場合は直接ファイルを開く
      if (isElectronEnvironment() && window.electron?.fs?.exists) {
        try {
          const exists = await window.electron.fs.exists(path);
          if (exists) {
            // OSの標準機能でファイルを開く
            await window.electron.testDialog();
            return {
              success: true,
              message: `ファイルを開きました: ${path}`,
              path: path
            };
          }
        } catch (e) {
          logger.debug('Electronでのファイルオープンに失敗、APIにフォールバック');
        }
      }
      
      // API経由でファイルを開く
      const data = await apiClient.post<FileResponse>('/files/open', { path }, undefined, { timeout: 8000 });
      return data;
    } catch (error: any) {
      logger.error(`ファイルを開く際のエラー: ${error.message}`);
      
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
      logger.debug(`ファイル選択ダイアログを表示: ${initialPath || 'デフォルト'}`);
      
      // Electron環境チェック
      if (isElectronEnvironment() && window.electron?.dialog?.openCSVFile) {
        try {
          // Electron経由でファイル選択
          logger.info('Electron経由でCSVファイル選択を実行');
          const result = await window.electron.dialog.openCSVFile(initialPath || '');
          return result;
        } catch (dialogError) {
          logger.warn(`Electronダイアログエラー: ${dialogError.message}`);
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
      logger.error(`ファイル選択エラー: ${error.message}`);
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

// API健全性チェック - initializeApi内で実行されるようになったため簡略化
export const healthCheck = async (): Promise<HealthResponse> => {
  return withApiInitialized(async () => {
    logger.debug('API健全性チェックを実行');
    const data = await apiClient.get<HealthResponse>('/health', undefined, { timeout: 5000 });
    return data;
  });
};

// キャッシュ管理 - リクエストキャッシュをクリア
export const clearRequestCache = (): void => {
  requestCache.clear();
  logger.info('リクエストキャッシュをクリア');
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
// connection.tsを削除したので、このエクスポートは不要