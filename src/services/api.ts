import { isElectronEnvironment } from '../utils/environment';
import { 
  Project, 
  DashboardMetrics, 
  FileResponse, 
  RecentTasks, 
  HealthResponse, 
  APIError,
  Milestone,
  MilestoneTimelineResponse
} from '../types';

// 安全なクライアントサイドチェック
const isClient = typeof window !== 'undefined';

// API要求キャッシュ - 同一リクエストの重複実行防止用
const requestCache = new Map<string, {
  promise: Promise<any>;
  timestamp: number;
}>();

/**
 * カスタムAPIエラークラス
 */
class ApiError extends Error implements APIError {
  status: number;
  details: string;
  isApiError: boolean;
  type: 'server_error' | 'network_error' | 'timeout_error' | 'unknown_error';

  constructor(
    message: string, 
    status: number = 0, 
    details: string = '', 
    type: 'server_error' | 'network_error' | 'timeout_error' | 'unknown_error' = 'unknown_error'
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.isApiError = true;
    this.type = type;
  }
}

/**
 * APIが初期化されていることを確認する高階関数 - 最適化版
 */
const withApiInitialized = async <T>(
  fn: () => Promise<T>, 
  cacheKey?: string, 
  cacheTTL: number = 5000
): Promise<T> => {
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

/**
 * 正しいURLパスを確保するためのヘルパー関数
 * すべてのエンドポイントに/apiプレフィックスが確実に含まれるようにする
 */
function ensureApiPath(endpoint: string): string {
  // endpointが既に/apiで始まっていればそのまま返す
  if (endpoint.startsWith('/api/')) {
    return endpoint;
  }
  
  // /で始まる場合は/api + endpointを返す
  if (endpoint.startsWith('/')) {
    return `/api${endpoint}`;
  }
  
  // それ以外は/api/を前置
  return `/api/${endpoint}`;
}

/**
 * APIクライアント - Electron IPC経由でAPIリクエスト
 */
class ElectronApiClient {
  private baseUrl: string = '';
  private requestTimeout: number = 10000;
  private requestCache: Map<string, { data: any, timestamp: number, ttl: number }> = new Map();
  
  /**
   * ベースURLを設定
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    console.log(`API Base URL設定: ${url}`);
  }
  
  /**
   * タイムアウトを設定
   */
  setTimeout(timeout: number): void {
    this.requestTimeout = timeout;
  }
  
  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.requestCache.clear();
    console.log('APIキャッシュをクリア');
  }
  
  /**
   * Electron環境かどうかをチェック
   */
  private isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && !!window.electron?.api;
  }
  
  /**
   * HTTPリクエストを送信
   */
  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, any>,
    data?: any,
    options: {
      timeout?: number;
      headers?: Record<string, string>;
      retries?: number;
    } = {}
  ): Promise<T> {
    // Electron環境でない場合はエラー
    if (!this.isElectronEnvironment()) {
      throw new ApiError(
        'Electron環境外ではAPIリクエストを実行できません',
        0,
        'Electron環境ではありません',
        'network_error'
      );
    }
    
    // 追加のチェック - TypeScriptの型チェックを満たすため
    if (!window.electron || !window.electron.api) {
      throw new ApiError(
        'Electron APIが利用できません',
        0,
        'Electron APIが見つかりません',
        'network_error'
      );
    }
    
    const { timeout = this.requestTimeout } = options;
    
    // パスの修正 - すべてのリクエストに/apiプレフィックスを確保
    const normalizedEndpoint = ensureApiPath(endpoint);
    
    try {
      // Electron APIブリッジ経由でリクエスト実行
      const result = await window.electron.api.request(
        method,
        normalizedEndpoint,
        params,
        data,
        { timeout, ...options }
      );
      
      return result as T;
    } catch (error: any) {
      // エラーが適切にフォーマットされていることを確認
      const apiError = new ApiError(
        error.message || 'APIリクエストエラー',
        error.status || 0,
        error.details || '',
        error.type || 'unknown_error'
      );
      
      throw apiError;
    }
  }
  
  /**
   * GETリクエスト
   */
  async get<T>(
    endpoint: string, 
    params?: Record<string, any>, 
    options: { timeout?: number; headers?: Record<string, string> } = {}, 
    cacheTTL: number = 0
  ): Promise<T> {
    // パスを正規化
    const normalizedEndpoint = ensureApiPath(endpoint);
    
    // キャッシュキーの生成
    const cacheKey = this.generateCacheKey(normalizedEndpoint, params);
    
    // キャッシュが有効な場合はキャッシュをチェック
    if (cacheTTL > 0) {
      const cachedItem = this.requestCache.get(cacheKey);
      if (cachedItem && Date.now() - cachedItem.timestamp < cachedItem.ttl) {
        return cachedItem.data;
      }
    }
    
    // リクエスト実行
    const data = await this.request<T>('GET', normalizedEndpoint, params, undefined, options);
    
    // 結果をキャッシュ
    if (cacheTTL > 0) {
      this.requestCache.set(cacheKey, { 
        data, 
        timestamp: Date.now(), 
        ttl: cacheTTL 
      });
    }
    
    return data;
  }
  
  /**
   * POSTリクエスト
   */
  async post<T>(
    endpoint: string, 
    data?: any, 
    params?: Record<string, any>, 
    options: { timeout?: number; headers?: Record<string, string> } = {}
  ): Promise<T> {
    // パスを正規化
    const normalizedEndpoint = ensureApiPath(endpoint);
    return this.request<T>('POST', normalizedEndpoint, params, data, options);
  }
  
  /**
   * PUTリクエスト
   */
  async put<T>(
    endpoint: string, 
    data?: any, 
    params?: Record<string, any>, 
    options: { timeout?: number; headers?: Record<string, string> } = {}
  ): Promise<T> {
    // パスを正規化
    const normalizedEndpoint = ensureApiPath(endpoint);
    return this.request<T>('PUT', normalizedEndpoint, params, data, options);
  }
  
  /**
   * DELETEリクエスト
   */
  async delete<T>(
    endpoint: string, 
    params?: Record<string, any>, 
    options: { timeout?: number; headers?: Record<string, string> } = {}
  ): Promise<T> {
    // パスを正規化
    const normalizedEndpoint = ensureApiPath(endpoint);
    return this.request<T>('DELETE', normalizedEndpoint, params, undefined, options);
  }
  
  /**
   * キャッシュキーを生成
   */
  private generateCacheKey(endpoint: string, params?: Record<string, any>): string {
    let key = endpoint;
    
    if (params) {
      const paramPairs = Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${String(value)}`)
        .sort();
      
      if (paramPairs.length > 0) {
        key += '?' + paramPairs.join('&');
      }
    }
    
    return key;
  }
}

// APIクライアントシングルトンインスタンス
export const apiClient = new ElectronApiClient();

/**
 * プロジェクト一覧とメトリクスを一度に取得（最適化）
 */
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

/**
 * プロジェクト一覧の取得
 */
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

/**
 * プロジェクト詳細の取得
 */
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

/**
 * プロジェクトの直近タスク情報を取得
 */
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

/**
 * ダッシュボードメトリクスの取得
 */
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

/**
 * デフォルトファイルパスの取得
 */
export const getDefaultPath = async (): Promise<FileResponse> => {
  return withApiInitialized(async () => {
    try {
      let storedPath = null;
      
      // ローカルストレージから前回のパスをチェック
      if (isClient) {
        try {
          storedPath = localStorage.getItem('lastSelectedPath');
        } catch (e) {
          // ローカルストレージエラーは無視
        }
      }
      
      // APIから取得
      const apiResponse = await apiClient.get<FileResponse>('/files/default-path', undefined, { timeout: 5000 });
      
      // 保存されたパスがある場合はそれを優先
      if (storedPath) {
        return {
          success: true,
          message: '前回のファイルパスを使用します',
          path: storedPath
        };
      }
      
      // APIからの応答を返す
      return apiResponse;
      
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

/**
 * ファイルを開く
 */
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

/**
 * ファイル選択ダイアログを表示する
 */
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

/**
 * API健全性チェック
 */
export const healthCheck = async (): Promise<HealthResponse> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<HealthResponse>('/health', undefined, { timeout: 5000 });
    return data;
  });
};

/**
 * マイルストーン一覧を取得する
 */
export const getMilestones = async (filePath?: string, projectId?: string): Promise<Milestone[]> => {
  return withApiInitialized(async () => {
    const params: any = { file_path: filePath };
    if (projectId) {
      params.project_id = projectId;
    }
    
    const data = await apiClient.get<Milestone[]>(
      '/milestones',
      params,
      { timeout: 8000 }
    );
    return data;
  }, `milestones_${filePath || 'default'}_${projectId || 'all'}`, 5000); // 5秒キャッシュ
};

/**
 * タイムライン表示用のマイルストーンデータを取得する
 */
export const getMilestoneTimeline = async (filePath?: string): Promise<MilestoneTimelineResponse> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<MilestoneTimelineResponse>(
      '/milestones/timeline',
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `milestone_timeline_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

/**
 * マイルストーンの詳細を取得する
 */
export const getMilestone = async (milestoneId: string, filePath?: string): Promise<Milestone> => {
  return withApiInitialized(async () => {
    const data = await apiClient.get<Milestone>(
      `/milestones/${milestoneId}`,
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  }, `milestone_${milestoneId}_${filePath || 'default'}`, 5000); // 5秒キャッシュ
};

/**
 * マイルストーンを作成する
 */
export const createMilestone = async (milestone: Milestone, filePath?: string): Promise<Milestone> => {
  return withApiInitialized(async () => {
    const data = await apiClient.post<Milestone>(
      '/milestones',
      milestone,
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  });
};

/**
 * マイルストーンを更新する
 */
export const updateMilestone = async (milestoneId: string, milestone: Milestone, filePath?: string): Promise<Milestone> => {
  return withApiInitialized(async () => {
    const data = await apiClient.put<Milestone>(
      `/milestones/${milestoneId}`,
      milestone,
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  });
};

/**
 * マイルストーンを削除する
 */
export const deleteMilestone = async (milestoneId: string, filePath?: string): Promise<{ success: boolean; message: string }> => {
  return withApiInitialized(async () => {
    const data = await apiClient.delete<{ success: boolean; message: string }>(
      `/milestones/${milestoneId}`,
      { file_path: filePath },
      { timeout: 8000 }
    );
    return data;
  });
};

/**
 * キャッシュ管理 - リクエストキャッシュをクリア
 */
export const clearRequestCache = (): void => {
  requestCache.clear();
};