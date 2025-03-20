import axios from 'axios';
import { DashboardMetrics, Project, FileResponse, RecentTasks, HealthResponse, ShutdownResponse } from './types';
import { 
  isClient, 
  isElectronEnvironment, 
  getApiInitialized, 
  setApiInitialized,
  getCurrentApiPort,
  setCurrentApiPort
} from './utils/environment';

// API初期化状態を追跡するためのPromise
let apiInitializationPromise: Promise<string> | null = null;

// ポート情報検出機能
export const detectApiPort = async (): Promise<number | null> => {
  try {
    // サーバーサイドでは実行しない
    if (!isClient) return null;
    
    console.log('APIポート自動検出を開始');
    
    // 1. 一時ファイルからポート情報を読み取る試み
    if (isElectronEnvironment()) {
      try {
        const tempDir = typeof window.electron?.getTempPath === 'function'
          ? await window.electron.getTempPath()
          : '/tmp';
          
        const portFilePath = await window.electron.path.join(tempDir, "project_dashboard_port.txt");
        
        console.log(`ポート情報ファイルを確認: ${portFilePath}`);
        
        if (await window.electron.fs.exists(portFilePath)) {
          const portData = await window.electron.fs.readFile(portFilePath, { encoding: 'utf8' });
          const port = parseInt(portData.trim(), 10);
          if (!isNaN(port) && port > 0) {
            console.log(`ポートファイルから検出: ${port}`);
            // 検出したポートが実際に応答するか確認
            if (await isApiAvailable(port)) {
              console.log(`ポート ${port} で応答を確認しました`);
              // ローカルストレージに保存
              try {
                localStorage.setItem('api_port', port.toString());
                localStorage.setItem('api_base_url', `http://127.0.0.1:${port}/api`);
              } catch (e) {
                console.warn('ポート情報のローカルストレージ保存に失敗:', e);
              }
              return port;
            } else {
              console.log(`ポート ${port} は応答しません。追加検証を試みます...`);
              
              // より長い待機時間で再試行
              await new Promise(resolve => setTimeout(resolve, 2000));
              if (await isApiAvailable(port, 5000)) {
                console.log(`ポート ${port} への2回目の接続試行に成功しました`);
                return port;
              }
            }
          }
        } else {
          console.log('ポート情報ファイルが見つかりません');
        }
      } catch (e) {
        console.warn('ポートファイルの読み取りエラー:', e);
      }
    }
    
    // 2. 複数の候補ポートを順次チェック (タイムアウト値を増加)
    const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
    console.log(`候補ポートを順次チェック: ${ports.join(', ')}`);
    
    for (const port of ports) {
      try {
        console.log(`ポート ${port} をチェック中...`);
        // タイムアウト値を増加させた確認
        if (await isApiAvailable(port, 5000)) {
          console.log(`アクティブなAPIポートを検出: ${port}`);
          // ローカルストレージに保存
          try {
            localStorage.setItem('api_port', port.toString());
            localStorage.setItem('api_base_url', `http://127.0.0.1:${port}/api`);
          } catch (e) {
            console.warn('ポート情報のローカルストレージ保存に失敗:', e);
          }
          return port;
        }
      } catch (e) {
        console.log(`ポート ${port} は応答しません`);
      }
    }
    
    // 3. ローカルストレージから以前の成功ポートを確認
    if (isClient) {
      try {
        const savedPort = localStorage.getItem('api_port');
        if (savedPort) {
          const port = parseInt(savedPort, 10);
          if (!isNaN(port)) {
            console.log(`ローカルストレージから以前のポートを試行: ${port}`);
            if (await isApiAvailable(port, 5000)) {
              console.log(`保存されていたポート ${port} で応答を確認しました`);
              return port;
            }
          }
        }
      } catch (e) {
        console.warn('ローカルストレージアクセスエラー:', e);
      }
    }
    
    // ポートが見つからなかった
    console.error('アクティブなAPIポートが見つかりませんでした');
    return null;
  } catch (e) {
    console.error('APIポート検出エラー:', e);
    return null;
  }
};

// 改善: API利用可能性チェック関数
const isApiAvailable = async (port: number, timeout: number = 3000): Promise<boolean> => {
  // サーバーサイドでは実行しない
  if (!isClient) return false;
  
  console.log(`ポート ${port} の可用性をチェック (タイムアウト: ${timeout}ms)`);
  
  // 複数の方法を並行して試す
  try {
    const results = await Promise.allSettled([
      // 方法1: fetch API (ブラウザ環境)
      (async () => {
        if (!isClient || !window.fetch) return false;
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          return response.status >= 200 && response.status < 300;
        } catch (e) {
          return false;
        }
      })(),
      
      // 方法2: axios GET リクエスト
      (async () => {
        try {
          const response = await axios.get(`http://127.0.0.1:${port}/api/health`, { 
            timeout: timeout,
            headers: { 'Accept': 'application/json' }
          });
          return response.status === 200;
        } catch (e) {
          return false;
        }
      })(),
      
      // 方法3: axios HEAD リクエスト (軽量なチェック)
      (async () => {
        try {
          const response = await axios.head(`http://127.0.0.1:${port}/api/health`, { 
            timeout: timeout / 2 // HEADリクエストは軽量なので短めのタイムアウト
          });
          return response.status < 500; // 500番台以外は応答と見なす
        } catch (e) {
          return false;
        }
      })()
    ]);
    
    // いずれかの方法が成功していれば利用可能と判断
    const isAvailable = results.some(
      result => result.status === 'fulfilled' && result.value === true
    );
    
    if (isAvailable) {
      console.log(`ポート ${port} は利用可能です`);
      return true;
    }
    
    console.log(`ポート ${port} は応答しませんでした`);
    return false;
  } catch (e) {
    console.error(`ポート ${port} の確認中にエラー:`, e);
    return false;
  }
};

// 環境に応じたAPI URLの設定
const getApiBaseUrl = async (): Promise<string> => {
  // サーバーサイドでは相対パスを返す
  if (!isClient) {
    return '/api';
  }
  
  // Electron環境でグローバル変数からAPIベースURLを取得
  if (isElectronEnvironment() && typeof window.electron?.getApiBaseUrl === 'function') {
    try {
      const url = await window.electron.getApiBaseUrl();
      return url;
    } catch (e) {
      console.warn('APIベースURL取得エラー:', e);
    }
  }
  
  // 開発環境では複数ポートを試す
  if (process.env.NODE_ENV === 'development') {
    console.log('開発環境を検出: 直接バックエンドURLを使用します');
    // 現在のポートを使用（グローバル変数から取得）
    if (isClient && getCurrentApiPort()) {
      return `http://127.0.0.1:${getCurrentApiPort()}/api`;
    }
    return 'http://127.0.0.1:8000/api';
  }
  
  // デバッグメッセージ
  console.log(`実行環境: ブラウザ`);
  console.log(`環境変数: ${process.env.NEXT_PUBLIC_API_URL || '未設定'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  
  // クライアントサイドでの判定
  // Electron環境の検出
  if (isElectronEnvironment() && window.electron?.env?.isElectron) {
    const url = window.electron.env.apiUrl || 'http://127.0.0.1:8000/api';
    console.log(`Electron環境が検出されました、APIエンドポイント: ${url}`);
    return url;
  }
  
  // Window objectが存在する環境でのローカルストレージチェック
  if (isClient) {
    try {
      const savedApiUrl = localStorage.getItem('api_base_url');
      if (savedApiUrl) {
        console.log(`ローカルストレージからAPIエンドポイントを取得: ${savedApiUrl}`);
        return savedApiUrl;
      }
      
      // 保存されたポート番号の使用
      const savedPort = localStorage.getItem('api_port');
      if (savedPort) {
        const port = parseInt(savedPort, 10);
        if (!isNaN(port)) {
          const url = `http://127.0.0.1:${port}/api`;
          console.log(`保存されたポート番号を使用: ${url}`);
          return url;
        }
      }
    } catch (e) {
      console.warn('ローカルストレージアクセスエラー:', e);
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

// 現在のAPIベースURLを非同期で取得するように修正
export const getCurrentApiUrl = async (): Promise<string> => {
  try {
    // APIベースURLをログに出力
    const url = await getApiBaseUrl();
    console.log(`現在のAPIベースURL: ${url}`);
    return url;
  } catch (error) {
    console.error('API URL取得エラー:', error);
    return '/api'; // エラー時のフォールバック
  }
};

// API初期化を行う関数
const initializeApi = async (): Promise<string> => {
  if (!isClient) return '/api';
  
  if (!apiInitializationPromise) {
    apiInitializationPromise = new Promise<string>(async (resolve) => {
      try {
        // APIベースURLを取得
        const baseURL = await getApiBaseUrl();
        console.log(`API初期化: ${baseURL}`);
        
        // APIクライアントを設定
        apiClient.defaults.baseURL = baseURL;
        setApiInitialized(true);
        
        resolve(baseURL);
      } catch (error) {
        console.error('API初期化エラー:', error);
        setApiInitialized(false);
        resolve('/api'); // デフォルト値
      }
    });
  }
  
  return apiInitializationPromise;
};

// APIクライアントのベース設定
const apiClient = axios.create({
  baseURL: '/api', // 初期値として安全な相対パスを設定
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  // タイムアウト設定を延長
  timeout: 10000, // 10秒に延長
});

// 初期化時にAPI設定を行う
if (isClient) {
  initializeApi();
}

// API呼び出しを行う前に初期化を確認するラッパー
const ensureApiInitialized = async <T>(
  apiCall: () => Promise<T>
): Promise<T> => {
  if (!isClient) {
    throw new Error('This function can only be called in client-side code');
  }
  
  // API初期化が完了していない場合は待機
  if (!getApiInitialized()) {
    await initializeApi();
  }
  
  // API呼び出しを実行
  return apiCall();
};

// ポートを更新する関数
export const updateApiPort = (port: number): void => {
  if (!isClient) return;
  
  setCurrentApiPort(port);
  apiClient.defaults.baseURL = `http://127.0.0.1:${port}/api`;
  setApiInitialized(true);
  
  // ローカルストレージに保存して再訪問時に使えるようにする
  try {
    localStorage.setItem('api_port', port.toString());
    localStorage.setItem('api_base_url', apiClient.defaults.baseURL);
  } catch (e) {
    console.warn('ポート情報のローカルストレージ保存に失敗:', e);
  }
  
  console.log(`APIベースURLを更新しました: ${apiClient.defaults.baseURL}`);
};

// リクエストインターセプター
apiClient.interceptors.request.use(
  (config) => {
    const fullUrl = `${config.baseURL}${config.url}${config.params ? `?${new URLSearchParams(config.params).toString()}` : ''}`;
    console.log(`🚀 リクエスト送信: ${config.method?.toUpperCase()} ${fullUrl}`, { 
      headers: config.headers,
      params: config.params || {},
      data: config.data,
      timeout: config.timeout
    });
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

// API接続テスト - リトライ機能を改善
export const testApiConnection = async (retryCount = 3): Promise<{ success: boolean; message: string; port?: number; details?: any }> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です',
      details: { error: 'SSR環境で実行されました' }
    };
  }
  
  console.log(`API接続テスト開始 (最大試行回数: ${retryCount})`);
  
  // 自動ポート検出試行
  const detectedPort = await detectApiPort();
  if (detectedPort) {
    // 検出したポートを設定
    updateApiPort(detectedPort);
    console.log(`ポート ${detectedPort} で応答するAPIを検出しました`);
    
    try {
      // 確認のための健全性チェック
      const { data } = await axios({
        method: 'GET',
        url: `http://127.0.0.1:${detectedPort}/api/health`,
        timeout: 5000,
        headers: { 'Accept': 'application/json' }
      });
      
      console.log('API接続テスト成功:', data);
      return {
        success: true,
        message: `API接続成功: ${data.status || 'OK'} ${data.version ? `(${data.version})` : ''}`,
        port: detectedPort,
        details: data
      };
    } catch (err) {
      // ポートは検出されたが健全性チェックに失敗
      console.warn(`ポート ${detectedPort} は検出されましたが、健全性チェックに失敗しました:`, err);
      
      // それでも接続は成功とみなす（サーバーが起動中かもしれない）
      return {
        success: true,
        message: `API検出成功 (ポート ${detectedPort}) - 部分的な接続`,
        port: detectedPort,
        details: { warning: "健全性チェックに失敗しましたが、APIは検出されました" }
      };
    }
  }
  
  let attempts = 0;
  let lastError = null;
  
  // 複数のポートを試す
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  
  for (const port of ports) {
    if (attempts >= retryCount) break;
    
    try {
      console.log(`API接続テスト実行中... ポート: ${port} (試行: ${attempts + 1}/${retryCount})`);
      
      // 一時的にAPIベースURLを変更して接続試行
      const { data } = await axios({
        method: 'GET',
        url: `http://127.0.0.1:${port}/api/health`,
        timeout: 5000 + (attempts * 2000), // リトライごとにタイムアウトを延長
        headers: { 'Accept': 'application/json' }
      });
      
      console.log(`ポート ${port} での接続テスト成功:`, data);
      
      // 成功したポートを保存
      updateApiPort(port);
      
      return {
        success: true,
        message: `API接続成功: ${data.status || 'OK'} ${data.version ? `(${data.version})` : ''}`,
        port: port,
        details: data
      };
    } catch (error: any) {
      console.warn(`ポート ${port} への接続テスト失敗:`, error);
      lastError = error;
      attempts++;
      
      // 待機時間を増やしながらリトライ
      if (attempts < retryCount && port === ports[ports.length - 1]) {
        const waitTime = attempts * 2000;
        console.log(`${waitTime}ms 待機後に再試行します...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // ユーザーフレンドリーなエラーメッセージ
  console.error('API接続テスト最終失敗:', lastError);
  
  let errorMessage = 'APIサーバーに接続できません。';
  let errorType = 'unknown';
  
  if (lastError) {
    if (lastError.code === 'ECONNABORTED') {
      errorType = 'timeout';
      errorMessage += ' サーバーの応答がタイムアウトしました。サーバーが起動中か、負荷が高い可能性があります。';
    } else if (lastError.code === 'ERR_NETWORK') {
      errorType = 'network';
      errorMessage += ' ネットワーク接続に問題があります。サーバーが起動していない可能性があります。';
    } else if (lastError.response) {
      errorType = 'server';
      errorMessage += ` サーバーがエラーを返しました: ${lastError.response.status} ${lastError.response.statusText}`;
    }
  }
  
  return {
    success: false,
    message: errorMessage,
    details: {
      error: lastError,
      type: errorType,
      attemptsMade: attempts,
      portsChecked: ports.slice(0, attempts)
    }
  };
};