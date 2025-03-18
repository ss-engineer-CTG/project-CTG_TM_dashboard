import axios from 'axios';
import { DashboardMetrics, Project, FileResponse, RecentTasks, HealthResponse, ShutdownResponse } from './types';

// 環境に応じたAPI URLの設定
const getApiBaseUrl = () => {
  // デバッグメッセージ
  console.log(`実行環境: ${typeof window !== 'undefined' ? 'ブラウザ' : 'サーバー'}`);
  console.log(`環境変数: ${process.env.NEXT_PUBLIC_API_URL || '未設定'}`);
  
  // クライアントサイドでの判定
  if (typeof window !== 'undefined') {
    // Electron環境の検出
    if (window.electron && window.electron.env && window.electron.env.isElectron) {
      const url = window.electron.env.apiUrl || 'http://127.0.0.1:8000/api';
      console.log(`Electron環境が検出されました、APIエンドポイント: ${url}`);
      return url;
    }
    
    // Window objectが存在する環境でのローカルストレージチェック
    const savedApiUrl = localStorage.getItem('api_base_url');
    if (savedApiUrl) {
      console.log(`ローカルストレージからAPIエンドポイントを取得: ${savedApiUrl}`);
      return savedApiUrl;
    }
  }
  
  // 環境変数による設定
  if (process.env.NEXT_PUBLIC_API_URL) {
    console.log(`環境変数からAPIエンドポイントを取得: ${process.env.NEXT_PUBLIC_API_URL}`);
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // 開発環境ではNext.jsのrewrites機能を使うため相対パスを使用
  console.log('デフォルトのAPIエンドポイントを使用: /api');
  return '/api';
};

// 現在のAPIベースURLを取得
export const getCurrentApiUrl = (): string => {
  // APIベースURLをログに出力
  const url = getApiBaseUrl();
  console.log(`現在のAPIベースURL: ${url}`);
  return url;
};

// APIクライアントのベース設定
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  // タイムアウト設定を短くする（5秒→3秒）
  timeout: 3000,
});

// リクエストインターセプター
apiClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 リクエスト送信: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, 
               config.params || {});
    return config;
  },
  (error) => {
    console.error('❌ リクエスト作成エラー:', error);
    return Promise.reject(error);
  }
);

// レスポンスインターセプター
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ レスポンス受信: ${response.config.method?.toUpperCase()} ${response.config.url}`, 
               { status: response.status, statusText: response.statusText });
    return response;
  },
  (error) => {
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
      // サーバーからのレスポンスがある場合
      console.error('🔴 サーバーエラー:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // リクエストは送信されたがレスポンスがない場合
      console.error('📭 レスポンスなし:', {
        message: 'サーバーからの応答がありません。サーバーが起動しているか確認してください。',
        url: error.config?.url,
      });
    } else {
      // その他のエラー
      console.error('❓ 予期しないエラー:', error.message);
    }
    
    // CORS関連のエラーをチェック
    if (error.message && error.message.includes('CORS')) {
      console.error('🔒 CORSエラー: オリジン間リクエストが許可されていません。サーバーのCORS設定を確認してください。');
    }
    
    // エラーオブジェクトに追加情報を付与
    const enhancedError = {
      ...error,
      type: error.code === 'ECONNABORTED' ? 'timeout_error' : 
            error.code === 'ERR_NETWORK' ? 'network_error' : 
            error.response ? 'server_error' : 'unknown_error',
      details: error.response?.data?.detail || error.message || '不明なエラー',
      isApiError: true
    };
    
    return Promise.reject(enhancedError);
  }
);

// API接続テスト - より短いタイムアウトで素早く失敗するように
export const testApiConnection = async (): Promise<{ success: boolean; message: string; details?: any }> => {
  try {
    console.log('API接続テスト実行中...');
    const { data } = await apiClient.get<HealthResponse>('/health', { timeout: 2000 });
    console.log('API接続テスト成功:', data);
    return {
      success: true,
      message: `API接続成功: ${data.status} (${data.version})`,
      details: data
    };
  } catch (error: any) {
    console.error('API接続テスト失敗:', error);
    
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        message: 'APIサーバーへの接続がタイムアウトしました。サーバーが起動しているか確認してください。',
        details: error
      };
    } else if (error.code === 'ERR_NETWORK') {
      return {
        success: false,
        message: 'APIサーバーに接続できません。サーバーが起動しているか確認してください。',
        details: error
      };
    } else if (error.response) {
      return {
        success: false,
        message: `APIエラー: ${error.response.status} - ${error.response.statusText}`,
        details: error.response.data
      };
    } else {
      return {
        success: false,
        message: `API接続エラー: ${error.message}`,
        details: error
      };
    }
  }
};

// プロジェクト一覧の取得
export const getProjects = async (filePath?: string): Promise<Project[]> => {
  try {
    console.log(`プロジェクト一覧取得中... filePath: ${filePath || 'なし'}`);
    const { data } = await apiClient.get<Project[]>('/projects', {
      params: { file_path: filePath }
    });
    console.log(`プロジェクト一覧取得成功: ${data.length}件`);
    return data;
  } catch (error: any) {
    const errorMessage = error.isApiError 
      ? `プロジェクト取得エラー: ${error.details}`
      : `プロジェクト取得中に予期しないエラーが発生しました: ${error.message}`;
    
    console.error('プロジェクト一覧取得失敗:', error);
    throw new Error(errorMessage);
  }
};

// プロジェクト詳細の取得
export const getProject = async (projectId: string, filePath?: string): Promise<Project> => {
  try {
    console.log(`プロジェクト詳細取得中... projectId: ${projectId}, filePath: ${filePath || 'なし'}`);
    const { data } = await apiClient.get<Project>(`/projects/${projectId}`, {
      params: { file_path: filePath }
    });
    console.log(`プロジェクト詳細取得成功: ${data.project_name}`);
    return data;
  } catch (error: any) {
    const errorMessage = error.isApiError
      ? `プロジェクト詳細取得エラー: ${error.details}`
      : `プロジェクト詳細取得中に予期しないエラーが発生しました: ${error.message}`;
    
    console.error('プロジェクト詳細取得失敗:', error);
    throw new Error(errorMessage);
  }
};

// プロジェクトの直近タスク情報を取得
export const getRecentTasks = async (projectId: string, filePath?: string): Promise<RecentTasks> => {
  try {
    console.log(`最近のタスク取得中... projectId: ${projectId}, filePath: ${filePath || 'なし'}`);
    const { data } = await apiClient.get<RecentTasks>(`/projects/${projectId}/recent-tasks`, {
      params: { file_path: filePath }
    });
    console.log('最近のタスク取得成功');
    return data;
  } catch (error: any) {
    const errorMessage = error.isApiError
      ? `タスク情報取得エラー: ${error.details}`
      : `タスク情報取得中に予期しないエラーが発生しました: ${error.message}`;
    
    console.error('最近のタスク取得失敗:', error);
    throw new Error(errorMessage);
  }
};

// ダッシュボードメトリクスの取得
export const getMetrics = async (filePath?: string): Promise<DashboardMetrics> => {
  try {
    console.log(`メトリクス取得中... filePath: ${filePath || 'なし'}`);
    const { data } = await apiClient.get<DashboardMetrics>('/metrics', {
      params: { file_path: filePath }
    });
    console.log('メトリクス取得成功');
    return data;
  } catch (error: any) {
    const errorMessage = error.isApiError
      ? `メトリクス取得エラー: ${error.details}`
      : `メトリクス取得中に予期しないエラーが発生しました: ${error.message}`;
    
    console.error('メトリクス取得失敗:', error);
    throw new Error(errorMessage);
  }
};

// デフォルトファイルパスの取得
export const getDefaultPath = async (): Promise<FileResponse> => {
  try {
    console.log('デフォルトファイルパス取得中...');
    const { data } = await apiClient.get<FileResponse>('/files/default-path');
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
};

// ファイルを開く
export const openFile = async (path: string): Promise<FileResponse> => {
  try {
    console.log(`ファイルを開く... path: ${path}`);
    const { data } = await apiClient.post<FileResponse>('/files/open', { path });
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
};

// ファイル選択ダイアログを表示する
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  try {
    console.log(`ファイル選択ダイアログ表示... initialPath: ${initialPath || 'なし'}`);
    const { data } = await apiClient.get<FileResponse>('/files/select', {
      params: { initial_path: initialPath }
    });
    console.log(`ファイル選択結果: ${data.success ? '選択成功' : '選択キャンセルまたは失敗'}`);
    return data;
  } catch (error: any) {
    console.error('ファイル選択失敗:', error);
    
    // エラーが発生してもFileResponse形式で返す
    return {
      success: false,
      message: error.isApiError
        ? `ファイル選択エラー: ${error.details}`
        : `ファイル選択中に予期しないエラーが発生しました: ${error.message}`,
      path: null
    };
  }
};

// APIの健全性をチェック
export const healthCheck = async (): Promise<HealthResponse> => {
  try {
    console.log('APIヘルスチェック実行中...');
    const { data } = await apiClient.get<HealthResponse>('/health');
    console.log('APIヘルスチェック成功:', data);
    return data;
  } catch (error: any) {
    console.error('APIヘルスチェック失敗:', error);
    throw new Error(error.isApiError 
      ? `健全性チェックエラー: ${error.details}` 
      : `健全性チェック中に予期しないエラーが発生しました: ${error.message}`);
  }
};

// バックエンドのシャットダウンをリクエスト
export const requestShutdown = async (): Promise<ShutdownResponse> => {
  try {
    console.log('APIシャットダウンリクエスト実行中...');
    const { data } = await apiClient.post<ShutdownResponse>('/shutdown');
    console.log('APIシャットダウンリクエスト成功:', data);
    return data;
  } catch (error: any) {
    console.error('APIシャットダウンリクエスト失敗:', error);
    throw new Error(error.isApiError
      ? `シャットダウンリクエストエラー: ${error.details}`
      : `シャットダウンリクエスト中に予期しないエラーが発生しました: ${error.message}`);
  }
};