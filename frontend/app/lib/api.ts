import axios from 'axios';
import { DashboardMetrics, Project, FileResponse, RecentTasks, HealthResponse, ShutdownResponse } from './types';

// クライアントサイドのみの処理を判定するヘルパー関数
const isClient = typeof window !== 'undefined';

// ポート情報検出機能
export const detectApiPort = async (): Promise<number | null> => {
  try {
    // サーバーサイドでは実行しない
    if (!isClient) return null;
    
    console.log('APIポート自動検出を開始');
    
    // 1. 一時ファイルからポート情報を読み取る試み
    if (window.electron && window.electron.fs) {
      try {
        const tempDir = typeof window.electron.getTempPath === 'function'
          ? await window.electron.getTempPath()
          : '/tmp';
          
        const portFilePath = window.electron.path.join(tempDir, "project_dashboard_port.txt");
        
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
    if (window.localStorage) {
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
      window.fetch ? 
        (async () => {
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
        })() : Promise.resolve(false),
      
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
      })(),
      
      // 方法4: XMLHttpRequest (古いブラウザ互換)
      (async () => {
        return new Promise<boolean>(resolve => {
          if (typeof XMLHttpRequest === 'undefined') {
            resolve(false);
            return;
          }
          
          const xhr = new XMLHttpRequest();
          let resolved = false;
          
          xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && !resolved) {
              resolved = true;
              resolve(xhr.status >= 200 && xhr.status < 500);
            }
          };
          
          xhr.ontimeout = function() {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          };
          
          xhr.onerror = function() {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          };
          
          try {
            xhr.open('HEAD', `http://127.0.0.1:${port}/api/health`, true);
            xhr.timeout = timeout / 2;
            xhr.send();
          } catch (e) {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          }
          
          // バックアップタイムアウト
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          }, timeout);
        });
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
const getApiBaseUrl = () => {
  // サーバーサイドでは相対パスを返す
  if (!isClient) {
    return '/api';
  }
  
  // Electron環境でグローバル変数からAPIベースURLを取得
  if (window.electron && window.electron.getApiBaseUrl) {
    try {
      return window.electron.getApiBaseUrl();
    } catch (e) {
      console.warn('APIベースURL取得エラー:', e);
    }
  }
  
  // 開発環境では複数ポートを試す
  if (process.env.NODE_ENV === 'development') {
    console.log('開発環境を検出: 直接バックエンドURLを使用します');
    // 現在のポートを使用（グローバル変数から取得）
    if (window.currentApiPort) {
      return `http://127.0.0.1:${window.currentApiPort}/api`;
    }
    return 'http://127.0.0.1:8000/api';
  }
  
  // デバッグメッセージ
  console.log(`実行環境: ブラウザ`);
  console.log(`環境変数: ${process.env.NEXT_PUBLIC_API_URL || '未設定'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  
  // クライアントサイドでの判定
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
    'Accept': 'application/json'
  },
  // タイムアウト設定を延長
  timeout: 10000, // 10秒に延長
});

// ポートを更新する関数
export const updateApiPort = (port: number): void => {
  if (!isClient) return;
  
  window.currentApiPort = port;
  apiClient.defaults.baseURL = `http://127.0.0.1:${port}/api`;
  
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

// ブラウザのファイル入力要素を使った選択
const selectFileUsingBrowser = (): Promise<FileResponse> => {
  if (!isClient) {
    return Promise.resolve({
      success: false,
      message: 'ブラウザ環境でのみ使用可能です',
      path: null
    });
  }

  return new Promise((resolve) => {
    // 一時的なファイル入力要素を作成
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    document.body.appendChild(input);

    // ファイル選択イベント
    input.onchange = (event) => {
      const files = (event.target as HTMLInputElement).files;
      
      // 要素を削除
      document.body.removeChild(input);
      
      if (files && files.length > 0) {
        // FileオブジェクトからURLを作成（表示用）
        const file = files[0];
        const fileName = file.name;
        
        // 開発環境ではファイルのパスは取得できないが、名前は取得可能
        resolve({
          success: true,
          message: `ファイルを選択しました: ${fileName}`,
          path: fileName // 本来はパスだが、開発環境ではファイル名のみ
        });
      } else {
        resolve({
          success: false,
          message: 'ファイルが選択されませんでした',
          path: null
        });
      }
    };

    // キャンセル処理
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve({
        success: false,
        message: 'ファイル選択がキャンセルされました',
        path: null
      });
    };

    // クリックイベントをトリガー
    input.click();
  });
};

// ファイル選択ダイアログを表示する
export const selectFile = async (initialPath?: string): Promise<FileResponse> => {
  try {
    console.log('[API] ファイル選択ダイアログ表示リクエスト開始', { 
      initialPath: initialPath || 'なし',
      apiUrl: getCurrentApiUrl()
    });
    
    // サーバーサイドでは早期リターン
    if (!isClient) {
      return {
        success: false,
        message: 'クライアント側でのみ使用可能な機能です',
        path: null
      };
    }
    
    // 開発環境かどうかをチェック
    if (process.env.NODE_ENV === 'development') {
      console.log('[API] 開発環境を検出、ブラウザのファイル選択を使用します');
      return await selectFileUsingBrowser();
    }
    
    // Electron環境かどうかをチェック
    if (window.electron && window.electron.dialog) {
      console.log('[API] Electron環境を検出、Electronダイアログを使用します');
      return await window.electron.dialog.openCSVFile(initialPath || '');
    }
    
    // それ以外の場合はAPIを使用
    console.log('[API] APIベースのファイル選択を使用します');
    const { data } = await apiClient.get<FileResponse>('/files/select', {
      params: { initial_path: initialPath },
      timeout: 30000 // ファイル選択には時間がかかる可能性があるため、長めのタイムアウト
    });
    
    return data;
  } catch (error: any) {
    console.error('[API] ファイル選択リクエストエラー:', error);
    
    // エラー発生時はブラウザのファイル選択にフォールバック
    if (isClient) {
      console.log('[API] エラー発生、ブラウザのファイル選択を使用します');
      return await selectFileUsingBrowser();
    }
    
    // フォールバックもできない場合はエラーレスポンスを返す
    return {
      success: false,
      message: error.isApiError
        ? `ファイル選択エラー: ${error.details}`
        : `ファイル選択中に予期しないエラーが発生しました: ${error.message}`,
      path: null
    };
  }
};

// ファイルアップロード
export const uploadCSVFile = async (file: File): Promise<FileResponse> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です',
      path: null
    };
  }
  
  try {
    console.log('[API] CSVファイルアップロード開始');
    
    // FormDataを作成
    const formData = new FormData();
    formData.append('file', file);
    
    // APIにアップロード
    const { data } = await apiClient.post<FileResponse>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 30000 // ファイルアップロードには時間がかかる可能性があるため、長めのタイムアウト
    });
    
    console.log('[API] ファイルアップロード成功:', data);
    return data;
  } catch (error: any) {
    console.error('[API] ファイルアップロードエラー:', error);
    return {
      success: false,
      message: error.isApiError
        ? `ファイルアップロードエラー: ${error.details}`
        : `ファイルアップロード中に予期しないエラーが発生しました: ${error.message}`,
      path: null
    };
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

// 後方互換性のためのエイリアス
export const healthCheck = testApiConnection;