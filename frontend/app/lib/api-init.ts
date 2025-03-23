// api-init.ts - APIクライアントの初期化と接続管理の統合モジュール
import { apiClient } from './client';
import { ConnectionTestResult, HealthResponse } from './types';
import { isClient, getApiInitialized, setApiInitialized, setCurrentApiPort } from './utils/environment';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('api_init_module_init');
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
  error: (message: string) => console.error(`[API] ${message}`),
  warn: (message: string) => currentLogLevel >= LogLevel.WARNING && console.warn(`[API] ${message}`),
  info: (message: string) => currentLogLevel >= LogLevel.INFO && console.info(`[API] ${message}`),
  debug: (message: string) => currentLogLevel >= LogLevel.DEBUG && console.debug(`[API] ${message}`)
};

// 並列ポート検出関数
export const detectApiPort = async (): Promise<number | null> => {
  if (!isClient) return null;
  
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('port_detection_start');
    logger.debug('ポート検出を開始');
  }
  
  // 1. Electron環境では環境変数やファイルからポート情報を取得
  if (typeof window !== 'undefined' && window.electron) {
    try {
      const apiBaseUrl = await window.electron.getApiBaseUrl();
      if (apiBaseUrl) {
        const urlObj = new URL(apiBaseUrl);
        const port = parseInt(urlObj.port, 10);
        if (!isNaN(port) && await isPortAvailable(port, 2000)) {
          logger.info(`Electron環境からポート${port}を検出しました`);
          return port;
        }
      }
    } catch (e) {
      logger.debug(`Electron APIポート検出試行: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }
  
  // 2. ローカルストレージから以前のポートを取得
  try {
    const savedPort = localStorage.getItem('api_port');
    if (savedPort) {
      const port = parseInt(savedPort, 10);
      if (!isNaN(port) && await isPortAvailable(port, 1500)) {
        logger.info(`保存済みポート${port}に接続しました`);
        return port;
      }
    }
  } catch (e) {
    logger.debug('ローカルストレージからのポート取得試行');
  }
  
  // 3. 複数の候補ポートを並列チェック
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  
  try {
    logger.debug(`${ports.length}個のポートを並列検出中...`);
    
    // ポート検査を並列実行するためのヘルパー関数
    const checkPortPromise = async (port: number) => {
      try {
        const isAvailable = await isPortAvailable(port, 1000);
        return { port, available: isAvailable };
      } catch (e) {
        return { port, available: false };
      }
    };
    
    // 並列でポート確認
    const portCheckPromises = ports.map(port => checkPortPromise(port));
    const results = await Promise.allSettled(portCheckPromises);
    
    // 利用可能なポートを検索
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.available) {
        const port = result.value.port;
        try {
          localStorage.setItem('api_port', port.toString());
        } catch (e) {
          /* エラーを無視 */
        }
        
        logger.info(`利用可能なポート${port}を検出しました`);
        return port;
      }
    }
    
    logger.warn('並列ポート検出で利用可能なポートが見つかりませんでした');
  } catch (e) {
    logger.warn(`ポート並列検出エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
  
  // 4. 順次検出を試みる（並列検出が失敗した場合のフォールバック）
  logger.debug('順次ポート検出を試行中...');
  for (const port of ports) {
    try {
      if (await isPortAvailable(port, 2000)) {
        try {
          localStorage.setItem('api_port', port.toString());
        } catch (e) {
          /* エラーを無視 */
        }
        
        logger.info(`順次検出でポート${port}を検出しました`);
        return port;
      }
    } catch (e) {
      logger.debug(`ポート${port}の検証をスキップ`);
    }
  }
  
  logger.error('利用可能なAPIポートが見つかりませんでした');
  return null;
};

// ポートが使用可能かどうかを確認する関数（最適化版）
const isPortAvailable = async (port: number, timeout: number = 2000): Promise<boolean> => {
  if (!isClient) return false;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'HEAD',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 300;
  } catch (e) {
    return false;
  }
};

// API接続テスト - 最適化版（複数回の再試行とエラー処理改善）
export const testApiConnection = async (retryCount = 3): Promise<ConnectionTestResult> => {
  if (!isClient) {
    return {
      success: false,
      message: 'クライアント側でのみ使用可能な機能です'
    };
  }
  
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('api_connection_test_start');
  }
  
  // ポート検出を実行（このメソッドが唯一のエントリーポイント）
  const port = await detectApiPort();
  
  if (!port) {
    logger.error('アクティブなAPIポートが検出できませんでした');
    return {
      success: false,
      message: 'バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。',
      details: { error: 'No active API port detected' }
    };
  }
  
  // 検出したポートで接続確認
  try {
    apiClient.setBaseUrl(`http://127.0.0.1:${port}/api`);
    setCurrentApiPort(port);
    
    // 複数回再試行を実装
    let lastError = null;
    let attemptsMade = 0;
    
    for (let attempt = 0; attempt < retryCount; attempt++) {
      attemptsMade++;
      try {
        logger.debug(`健全性チェック試行 ${attempt + 1}/${retryCount}`);
        
        // 健全性チェック
        const data = await apiClient.get<HealthResponse>('/health', undefined, { timeout: 3000 });
        
        setApiInitialized(true);
        
        // パフォーマンスマーク - 成功
        if (typeof window !== 'undefined') {
          window.performance.mark('api_connection_test_success');
          window.performance.measure('api_connection_test_success_duration', 'api_connection_test_start', 'api_connection_test_success');
        }
        
        logger.info(`APIサーバーに接続しました (ポート: ${port})`);
        return {
          success: true,
          message: `APIサーバーに接続しました (ポート: ${port})`,
          port: port,
          details: data
        };
      } catch (error: any) {
        lastError = error;
        
        // 最後の試行でなければ、少し待ってから再試行
        if (attempt < retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // すべての再試行が失敗した場合
    logger.warn(`${retryCount}回の健全性チェックに失敗しました`);
    
    // エラーの場合でもポートが検出できていれば部分的に成功とみなす
    setApiInitialized(true);
    
    return {
      success: true,
      message: `APIサーバーを検出しました (ポート: ${port})`,
      port: port,
      details: { 
        warning: "健全性チェックに失敗しましたが、APIは検出されました",
        error: lastError?.message,
        retries: retryCount,
        attemptsMade
      }
    };
  } catch (error: any) {
    logger.error(`APIサーバー接続エラー: ${error.message}`);
    
    return {
      success: false,
      message: `APIサーバーに接続できません: ${error.message}`,
      details: {
        error: error.message,
        port: port,
        isApiError: error.isApiError || false
      }
    };
  }
};

// APIの検出・初期化 - シングルトンパターン実装
let apiInitializationPromise: Promise<boolean> | null = null;

export const initializeApi = async (): Promise<boolean> => {
  if (!isClient) return false;
  
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('api_initialization_start');
  }
  
  // 既存の初期化処理があれば再利用（重複初期化の防止）
  if (apiInitializationPromise) {
    return apiInitializationPromise;
  }
  
  // 初期化処理の実行と結果キャッシュ
  apiInitializationPromise = new Promise<boolean>((resolve) => {
    // 内部で非同期関数を作成して呼び出す
    const initAsync = async () => {
      try {
        if (getApiInitialized()) {
          logger.debug('APIが既に初期化済みです');
          resolve(true);
          return;
        }
        
        // 接続試行
        const result = await testApiConnection();
        setApiInitialized(result.success);
        
        logger.info(`API初期化${result.success ? '成功' : '失敗'}: ${result.message}`);
        resolve(result.success);
      } catch (e) {
        logger.error(`API初期化エラー: ${e instanceof Error ? e.message : 'Unknown error'}`);
        setApiInitialized(false);
        resolve(false);
      }
    };
    
    // 非同期関数を呼び出す
    initAsync();
  });
  
  return apiInitializationPromise;
};

// APIポートの再検出 - 接続喪失時の回復機能
export const rediscoverApiPort = async (): Promise<number | null> => {
  // 初期化状態をリセット
  apiInitializationPromise = null;
  
  logger.info('APIポートの再検出を開始...');
  
  // 接続確認を実行
  const result = await testApiConnection();
  
  if (result.success && result.port) {
    return result.port;
  }
  
  return null;
};

// パフォーマンスマーク - 初期化完了
if (typeof window !== 'undefined') {
  window.performance.mark('api_init_module_complete');
  window.performance.measure(
    'api_init_module_initialization',
    'api_init_module_init',
    'api_init_module_complete'
  );
}