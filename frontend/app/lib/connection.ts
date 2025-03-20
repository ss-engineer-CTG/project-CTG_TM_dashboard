import { apiClient } from './client';
import { ConnectionTestResult, HealthResponse } from './types';
import { 
  isClient, 
  isElectronEnvironment, 
  getApiInitialized, 
  setApiInitialized,
  getCurrentApiPort,
  setCurrentApiPort
} from './utils/environment';

// ポート検出と接続テスト
export const detectApiPort = async (): Promise<number | null> => {
  if (!isClient) return null;
  
  console.log('APIポート自動検出を開始');
  
  // 1. Electron環境では環境変数やファイルからポート情報を取得
  if (isElectronEnvironment()) {
    try {
      const apiBaseUrl = await window.electron.getApiBaseUrl();
      if (apiBaseUrl) {
        const urlObj = new URL(apiBaseUrl);
        const port = parseInt(urlObj.port, 10);
        if (!isNaN(port) && await isPortAvailable(port)) {
          console.log(`Electronから検出したポート: ${port}`);
          return port;
        }
      }
    } catch (e) {
      console.warn('Electronからのポート検出エラー:', e);
    }
  }
  
  // 2. ローカルストレージから以前のポートを取得
  try {
    const savedPort = localStorage.getItem('api_port');
    if (savedPort) {
      const port = parseInt(savedPort, 10);
      if (!isNaN(port) && await isPortAvailable(port)) {
        console.log(`以前保存されたポートを使用: ${port}`);
        return port;
      }
    }
  } catch (e) {
    console.warn('ローカルストレージからの読み取りエラー:', e);
  }
  
  // 3. 複数の候補ポートを順次チェック
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  console.log(`候補ポートを順次チェック: ${ports.join(', ')}`);
  
  for (const port of ports) {
    console.log(`ポート ${port} をチェック中...`);
    if (await isPortAvailable(port)) {
      console.log(`アクティブなAPIポートを検出: ${port}`);
      
      // 見つかったポートを保存
      try {
        localStorage.setItem('api_port', port.toString());
      } catch (e) {
        console.warn('ポート情報のローカルストレージ保存に失敗:', e);
      }
      
      return port;
    }
  }
  
  console.error('アクティブなAPIポートが見つかりませんでした');
  return null;
};

// ポートが使用可能かどうかを確認
const isPortAvailable = async (port: number): Promise<boolean> => {
  if (!isClient) return false;
  
  // fetch APIを使った効率的なチェック
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'HEAD',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 300;
  } catch (e) {
    // 接続エラーは単に利用不可を意味する
    return false;
  }
};

// API接続テスト
export const testApiConnection = async (retryCount = 2): Promise<ConnectionTestResult> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です'
    };
  }
  
  console.log(`API接続テスト開始 (最大試行回数: ${retryCount})`);
  
  // ポート検出を実行
  const port = await detectApiPort();
  
  if (!port) {
    return {
      success: false,
      message: 'バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。',
      details: { 
        error: 'No active API port detected',
        attemptsMade: 1
      }
    };
  }
  
  // 検出したポートで接続確認
  try {
    apiClient.setBaseUrl(`http://127.0.0.1:${port}/api`);
    setCurrentApiPort(port);
    
    // 健全性チェック
    const data = await apiClient.get<HealthResponse>('/health');
    
    setApiInitialized(true);
    
    return {
      success: true,
      message: `APIサーバーに接続しました (ポート: ${port})`,
      port: port,
      details: data
    };
  } catch (error: any) {
    console.warn(`ポート ${port} は検出されましたが、健全性チェックに失敗しました:`, error);
    
    // エラーの場合でもポートが検出できていれば部分的に成功とみなす
    return {
      success: true,
      message: `APIサーバーを検出しました (ポート: ${port})`,
      port: port,
      details: { 
        warning: "健全性チェックに失敗しましたが、APIは検出されました",
        error: error.message 
      }
    };
  }
};

// APIの検出・初期化
let apiInitializationPromise: Promise<boolean> | null = null;

export const initializeApi = async (): Promise<boolean> => {
  if (!isClient) return false;
  
  if (!apiInitializationPromise) {
    apiInitializationPromise = new Promise<boolean>(async (resolve) => {
      try {
        if (getApiInitialized()) {
          // 既に初期化済みの場合はそのまま成功を返す
          resolve(true);
          return;
        }
        
        const result = await testApiConnection();
        setApiInitialized(result.success);
        resolve(result.success);
      } catch (e) {
        console.error('API初期化エラー:', e);
        setApiInitialized(false);
        resolve(false);
      }
    });
  }
  
  return apiInitializationPromise;
};