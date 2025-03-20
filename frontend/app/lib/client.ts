import axios, { AxiosInstance, AxiosError } from 'axios';
import { APIError } from './types';

class ApiClient {
  private client: AxiosInstance;
  private baseUrl: string = '/api';

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000,
    });

    this.setupInterceptors();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
    this.client.defaults.baseURL = url;
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('api_base_url', url);
      } catch (e) {
        console.warn('Failed to save API URL to localStorage', e);
      }
    }
  }

  private setupInterceptors() {
    // リクエストインターセプター
    this.client.interceptors.request.use(
      (config) => {
        const fullUrl = `${config.baseURL}${config.url}${config.params ? `?${new URLSearchParams(config.params).toString()}` : ''}`;
        console.log(`🚀 リクエスト送信: ${config.method?.toUpperCase()} ${fullUrl}`);
        return config;
      },
      (error) => {
        console.error('❌ リクエスト作成エラー:', error);
        return Promise.reject(error);
      }
    );

    // レスポンスインターセプター
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ レスポンス受信: ${response.config.method?.toUpperCase()} ${response.config.url}`, 
                   { status: response.status, statusText: response.statusText });
        return response;
      },
      (error: AxiosError) => {
        if (error.code === 'ECONNABORTED') {
          console.error('⏱️ リクエストタイムアウト:', {
            url: error.config?.url,
            timeout: error.config?.timeout,
            message: 'サーバーからの応答がタイムアウトしました。サーバーが起動しているか確認してください。'
          });
        } else if (error.code === 'ERR_NETWORK') {
          console.error('🌐 ネットワークエラー:', {
            url: error.config?.url,
            message: 'ネットワーク接続エラー。サーバーが起動しているか確認してください。'
          });
        } else if (error.response) {
          console.error('🔴 サーバーエラー:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            url: error.config?.url
          });
        } else if (error.request) {
          console.error('📭 レスポンスなし:', {
            message: 'サーバーからの応答がありません。サーバーが起動しているか確認してください。',
            url: error.config?.url,
          });
        } else {
          console.error('❓ 予期しないエラー:', error.message);
        }
        
        // 標準化されたエラーオブジェクトを生成
        const apiError: APIError = {
          name: error.name,
          message: error.message || 'APIエラーが発生しました',
          type: this.getErrorType(error),
          details: error.response?.data?.detail || error.message || '不明なエラー',
          status: error.response?.status,
          isApiError: true,
        };
        
        return Promise.reject(apiError);
      }
    );
  }

  private getErrorType(error: AxiosError): string {
    if (error.code === 'ECONNABORTED') return 'timeout_error';
    if (error.code === 'ERR_NETWORK') return 'network_error';
    if (error.response) return 'server_error';
    return 'unknown_error';
  }

  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async postFormData<T>(url: string, formData: FormData): Promise<T> {
    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }
}

// シングルトンインスタンスをエクスポート
export const apiClient = new ApiClient();