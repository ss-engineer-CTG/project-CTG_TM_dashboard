/**
 * HTTPクライアント
 * - IPC通信を使用してAPIリクエストを処理
 * - レスポンスの処理
 * - エラーハンドリング
 */

// コードサイズ削減のための型定義
type QueryParams = Record<string, any>;
type RequestOptions = { timeout?: number; headers?: Record<string, string> };

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

// APIクライアントクラス
class ApiClient {
  private baseUrl: string;
  private requestTimeout: number;
  private requestCache: Map<string, { data: any, timestamp: number, ttl: number }>;
  
  constructor(baseUrl: string = '', timeout: number = 10000) {
    this.baseUrl = baseUrl;
    this.requestTimeout = timeout;
    this.requestCache = new Map();
  }

  // ベースURLを設定
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    console.log(`API Base URL設定: ${url}`);
  }

  // タイムアウトを設定
  setTimeout(timeout: number): void {
    this.requestTimeout = timeout;
  }

  // キャッシュのクリア
  clearCache(): void {
    this.requestCache.clear();
    console.log('APIキャッシュをクリア');
  }

  // Electron環境かどうかをチェック
  private isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && !!window.electron?.api;
  }

  // HTTPリクエストを送信
  private async request<T>(
    method: string,
    endpoint: string,
    params?: QueryParams,
    data?: any,
    options: RequestOptions = {}
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
    
    try {
      // Electron APIブリッジ経由でリクエスト実行
      const result = await window.electron.api.request(
        method,
        endpoint,
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

  // キャッシュを使用した高速化されたGETリクエスト
  async get<T>(endpoint: string, params?: QueryParams, options: RequestOptions = {}, cacheTTL: number = 0): Promise<T> {
    // キャッシュキーの生成
    const cacheKey = this.generateCacheKey(endpoint, params);
    
    // キャッシュが有効な場合はキャッシュをチェック
    if (cacheTTL > 0) {
      const cachedItem = this.requestCache.get(cacheKey);
      if (cachedItem && Date.now() - cachedItem.timestamp < cachedItem.ttl) {
        return cachedItem.data;
      }
    }
    
    // リクエスト実行
    const data = await this.request<T>('GET', endpoint, params, undefined, options);
    
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

  // POSTリクエスト
  async post<T>(endpoint: string, data?: any, params?: QueryParams, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', endpoint, params, data, options);
  }

  // PUTリクエスト
  async put<T>(endpoint: string, data?: any, params?: QueryParams, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', endpoint, params, data, options);
  }

  // DELETEリクエスト
  async delete<T>(endpoint: string, params?: QueryParams, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', endpoint, params, undefined, options);
  }

  // キャッシュキーを生成
  private generateCacheKey(endpoint: string, params?: QueryParams): string {
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

// シングルトンインスタンスを作成
export const apiClient = new ApiClient('', 10000);