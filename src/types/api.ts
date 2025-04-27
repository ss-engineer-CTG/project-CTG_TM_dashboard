// API通信関連の型定義

// クエリパラメータ型
export type QueryParams = Record<string, any>;

// リクエストオプション型
export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
}

// API要求型
export interface ApiRequest {
  method: string;
  path: string;
  params?: QueryParams;
  data?: any;
  options?: RequestOptions;
}

// APIレスポンス型
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers?: Record<string, string>;
}

// APIクライアント型
export interface ApiClient {
  setBaseUrl: (url: string) => void;
  setTimeout: (timeout: number) => void;
  clearCache: () => void;
  get: <T>(endpoint: string, params?: QueryParams, options?: RequestOptions, cacheTTL?: number) => Promise<T>;
  post: <T>(endpoint: string, data?: any, params?: QueryParams, options?: RequestOptions) => Promise<T>;
  put: <T>(endpoint: string, data?: any, params?: QueryParams, options?: RequestOptions) => Promise<T>;
  delete: <T>(endpoint: string, params?: QueryParams, options?: RequestOptions) => Promise<T>;
}

// APIサービス型
export interface ApiService {
  projects: {
    getAll: (filePath?: string) => Promise<import('./models').Project[]>;
    getById: (id: string, filePath?: string) => Promise<import('./models').Project>;
    getRecentTasks: (id: string, filePath?: string) => Promise<import('./models').RecentTasks>;
  };
  metrics: {
    getDashboard: (filePath?: string) => Promise<import('./models').DashboardMetrics>;
  };
  files: {
    getDefaultPath: () => Promise<import('./models').FileResponse>;
    openFile: (path: string) => Promise<import('./models').FileResponse>;
    selectFile: (initialPath?: string) => Promise<import('./models').FileResponse>;
  };
  health: {
    check: () => Promise<import('./models').HealthResponse>;
  };
}