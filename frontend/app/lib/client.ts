/**
 * HTTPクライアント
 * - URLの構築
 * - リクエストの送信
 * - レスポンスの処理
 * - エラーハンドリング
 */

// コードサイズ削減のための型定義
type QueryParams = Record<string, any>;
type RequestOptions = RequestInit & { timeout?: number };

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
  error: (message: string) => console.error(`[API Client] ${message}`),
  warn: (message: string) => currentLogLevel >= LogLevel.WARNING && console.warn(`[API Client] ${message}`),
  info: (message: string) => currentLogLevel >= LogLevel.INFO && console.info(`[API Client] ${message}`),
  debug: (message: string) => currentLogLevel >= LogLevel.DEBUG && console.debug(`[API Client] ${message}`)
};

// カスタムAPIエラー型を定義
class ApiError extends Error {
  status: number;
  details: string;
  isApiError: boolean;
  type: 'server_error' | 'network_error' | 'timeout_error' | 'unknown_error';

  constructor(message: string, status: number = 0, details: string = '', type: 'server_error' | 'network_error' | 'timeout_error' | 'unknown_error' = 'unknown_error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.isApiError = true;
    this.type = type;
  }
}

// APIクライアントクラス - 最適化版
class ApiClient {
  private baseUrl: string;
  private requestTimeout: number;
  private requestCache: Map<string, { data: any, timestamp: number, ttl: number }>;
  private retryConfig: {
    maxRetries: number;
    retryDelay: number;
    retryableErrors: string[];
  };

  constructor(baseUrl: string = '', timeout: number = 10000) {
    this.baseUrl = baseUrl;
    this.requestTimeout = timeout;
    this.requestCache = new Map();
    this.retryConfig = {
      maxRetries: 2, // 再試行回数
      retryDelay: 1000, // 再試行の遅延(ms)
      retryableErrors: ['Failed to fetch', 'Network request failed', 'timeout', 'network'] // 再試行可能なエラー
    };
  }

  // ベースURLを設定
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    logger.info(`API Base URL設定: ${url}`);
  }

  // タイムアウトを設定
  setTimeout(timeout: number): void {
    this.requestTimeout = timeout;
  }

  // キャッシュのクリア
  clearCache(): void {
    this.requestCache.clear();
    logger.debug('APIキャッシュをクリア');
  }

  // URLを構築
  private buildUrl(endpoint: string, params?: QueryParams): string {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    return url.toString();
  }

  // HTTPリクエストを送信（リトライロジック追加）
  private async request<T>(
    method: string,
    endpoint: string,
    params?: QueryParams,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const { timeout = this.requestTimeout, ...fetchOptions } = options;
    
    // JSON.stringifyを一度だけ実行
    const body = data ? JSON.stringify(data) : undefined;
    
    // 基本オプションを設定
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...fetchOptions.headers
      },
      body,
      ...fetchOptions,
      // headersとbodyを上書きするのを防ぐ
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(fetchOptions.headers || {})
      }
    };
    
    // リトライカウンター
    let retryCount = 0;
    let lastError: any = null;
    
    do {
      // 再試行時の待機時間を指数バックオフで計算
      if (retryCount > 0) {
        const delay = this.retryConfig.retryDelay * Math.pow(2, retryCount - 1);
        logger.debug(`リクエスト再試行: ${retryCount}/${this.retryConfig.maxRetries} (待機: ${delay}ms)`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        // リクエストの作成とAbortControllerの設定
        const controller = new AbortController();
        const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
        requestOptions.signal = controller.signal;
        
        // リクエストを実行
        logger.debug(`API ${method} リクエスト: ${url.split('?')[0]}`);
        const response = await fetch(url, requestOptions);
        
        // タイムアウトをクリア
        if (timeoutId) clearTimeout(timeoutId);
        
        // レスポンスがJSONでない場合を処理
        if (response.headers.get('content-type')?.includes('application/json')) {
          const responseData = await response.json();
          
          // エラーレスポンスを処理
          if (!response.ok) {
            const errorMessage = responseData.detail || responseData.message || response.statusText;
            throw new ApiError(
              `APIエラー: ${errorMessage}`,
              response.status,
              JSON.stringify(responseData),
              'server_error'
            );
          }
          
          logger.debug(`API レスポンス成功: ${url.split('?')[0]}`);
          return responseData;
        } else {
          // JSONでないレスポンスボディの読み込み
          const text = await response.text();
          
          if (!response.ok) {
            throw new ApiError(
              `APIエラー: ${response.statusText}`,
              response.status,
              text,
              'server_error'
            );
          }
          
          // 空のレスポンスを処理
          return (text ? JSON.parse(text) : {}) as T;
        }
      } catch (error: any) {
        // タイムアウトの確認
        if (timeoutId) clearTimeout(timeoutId);
        
        lastError = error;
        
        // 再試行可能なエラーか確認
        const isRetryable = 
          error.name === 'AbortError' || // タイムアウト
          this.retryConfig.retryableErrors.some(errStr => 
            error.message?.toLowerCase().includes(errStr.toLowerCase())
          );
        
        // 再試行可能で、まだ試行回数が残っている場合
        if (isRetryable && retryCount < this.retryConfig.maxRetries) {
          retryCount++;
          continue;
        }
        
        // AbortControllerによるタイムアウトエラーを検出
        if (error.name === 'AbortError') {
          const timeoutError = new ApiError(
            'リクエストがタイムアウトしました',
            408,
            `Timeout after ${timeout}ms`,
            'timeout_error'
          );
          logger.warn(`API タイムアウト: ${url.split('?')[0]} (${timeout}ms)`);
          throw timeoutError;
        }
        
        // API独自のエラーを再スロー
        if (error.isApiError) {
          logger.error(`API エラー: ${error.message}`);
          throw error;
        }
        
        // ネットワークエラー - 開発環境以外ではエラーログを簡略化
        if (error.message.includes('Failed to fetch') || error.message.includes('Network request failed')) {
          const networkError = new ApiError(
            'ネットワークエラー: サーバーに接続できません',
            0,
            error.message,
            'network_error'
          );
          
          // 開発環境のみ詳細ログを出力
          if (process.env.NODE_ENV === 'development') {
            logger.error(`API ネットワークエラー: ${url.split('?')[0]} - ${error.message}`);
          } else {
            logger.error(`API ネットワークエラー: ${url.split('?')[0]}`);
          }
          
          throw networkError;
        }
        
        // その他のエラー
        logger.error(`API 予期せぬエラー: ${url.split('?')[0]} - ${error.message}`);
        throw new ApiError(
          `予期しないエラー: ${error.message}`,
          0,
          error.stack || '',
          'unknown_error'
        );
      }
    } while (retryCount <= this.retryConfig.maxRetries);
    
    // ここには到達しないはずだが、念のため
    throw lastError;
  }

  // キャッシュを使用した高速化されたGETリクエスト
  async get<T>(endpoint: string, params?: QueryParams, options: RequestOptions = {}, cacheTTL: number = 0): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    
    // キャッシュが有効な場合はキャッシュをチェック
    if (cacheTTL > 0) {
      const cachedItem = this.requestCache.get(url);
      if (cachedItem && Date.now() - cachedItem.timestamp < cachedItem.ttl) {
        logger.debug(`API キャッシュヒット: ${url.split('?')[0]}`);
        return cachedItem.data;
      }
    }
    
    const data = await this.request<T>('GET', endpoint, params, undefined, options);
    
    // 結果をキャッシュ
    if (cacheTTL > 0) {
      this.requestCache.set(url, { 
        data, 
        timestamp: Date.now(), 
        ttl: cacheTTL 
      });
      logger.debug(`API キャッシュ保存: ${url.split('?')[0]} (TTL: ${cacheTTL}ms)`);
    }
    
    return data;
  }

  // 最適化されたPOSTリクエスト
  async post<T>(endpoint: string, data?: any, params?: QueryParams, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', endpoint, params, data, options);
  }

  // 最適化されたPUTリクエスト
  async put<T>(endpoint: string, data?: any, params?: QueryParams, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', endpoint, params, data, options);
  }

  // 最適化されたDELETEリクエスト
  async delete<T>(endpoint: string, params?: QueryParams, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', endpoint, params, undefined, options);
  }
}

// シングルトンインスタンスを作成
export const apiClient = new ApiClient('', 10000); // 10秒タイムアウト