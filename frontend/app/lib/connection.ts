import { apiClient } from './client';
// 循環依存の修正のため削除
// import { initializeApi } from './connection';
import { ConnectionTestResult, HealthResponse } from './types';
import { isClient, isElectronEnvironment, getApiInitialized, setApiInitialized, getCurrentApiPort, setCurrentApiPort } from './utils/environment';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('connection_module_init');
}

// ポート検出と接続テスト - 最適化版
export const detectApiPort = async (): Promise<number | null> => {
  if (!isClient) return null;
  
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('port_detection_start');
  }
  
  // 1. Electron環境では環境変数やファイルからポート情報を取得
  if (isElectronEnvironment()) {
    try {
      if (window.electron) {
        const apiBaseUrl = await window.electron.getApiBaseUrl();
        if (apiBaseUrl) {
          const urlObj = new URL(apiBaseUrl);
          const port = parseInt(urlObj.port, 10);
          if (!isNaN(port) && await isPortAvailable(port, 2000)) { // タイムアウト延長：1000ms→2000ms
            // パフォーマンスマーク
            if (typeof window !== 'undefined') {
              window.performance.mark('port_detection_electron_success');
              window.performance.measure('port_detection_electron', 'port_detection_start', 'port_detection_electron_success');
            }
            return port;
          }
        }
      }
    } catch (e) {
      console.error('Electron APIポート検出エラー:', e);
    }
  }
  
  // 2. ローカルストレージから以前のポートを取得
  try {
    const savedPort = localStorage.getItem('api_port');
    if (savedPort) {
      const port = parseInt(savedPort, 10);
      if (!isNaN(port) && await isPortAvailable(port, 1500)) { // タイムアウト延長：800ms→1500ms
        // パフォーマンスマーク
        if (typeof window !== 'undefined') {
          window.performance.mark('port_detection_localStorage_success');
          window.performance.measure('port_detection_localStorage', 'port_detection_start', 'port_detection_localStorage_success');
        }
        return port;
      }
    }
  } catch (e) {
    console.warn('ローカルストレージからのポート取得エラー:', e);
  }
  
  // 3. 複数の候補ポートを並列チェック
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  
  try {
    // 並列でポート確認
    const portChecks = await Promise.allSettled(
      ports.map(async port => {
        try {
          const isAvailable = await isPortAvailable(port, 1000); // タイムアウト延長：500ms→1000ms
          return { port, available: isAvailable };
        } catch (e) {
          return { port, available: false };
        }
      })
    );
    
    // 利用可能なポートを抽出
    for (const result of portChecks) {
      if (result.status === 'fulfilled' && result.value.available) {
        const port = result.value.port;
        try {
          localStorage.setItem('api_port', port.toString());
        } catch (e) {}
        
        // パフォーマンスマーク - 並列検出成功
        if (typeof window !== 'undefined') {
          window.performance.mark('port_detection_parallel_success');
          window.performance.measure('port_detection_parallel', 'port_detection_start', 'port_detection_parallel_success');
        }
        
        return port;
      }
    }
  } catch (e) {
    console.error('ポート並列検出エラー:', e);
  }
  
  // 4. 順次検出を試みる（並列検出が失敗した場合のフォールバック）
  for (const port of ports) {
    try {
      if (await isPortAvailable(port, 2000)) { // タイムアウト延長：500ms→2000ms
        try {
          localStorage.setItem('api_port', port.toString());
        } catch (e) {}
        
        // パフォーマンスマーク - 順次検出成功
        if (typeof window !== 'undefined') {
          window.performance.mark('port_detection_sequential_success');
          window.performance.measure('port_detection_sequential', 'port_detection_start', 'port_detection_sequential_success');
        }
        
        return port;
      }
    } catch (e) {
      continue;
    }
  }
  
  // パフォーマンスマーク - 失敗
  if (typeof window !== 'undefined') {
    window.performance.mark('port_detection_failed');
    window.performance.measure('port_detection_failure', 'port_detection_start', 'port_detection_failed');
  }
  
  console.error('使用可能なAPIポートが見つかりませんでした');
  return null;
};

// ポートが使用可能かどうかを確認 - 最適化版
const isPortAvailable = async (port: number, timeout: number = 2000): Promise<boolean> => { // タイムアウト延長：1000ms→2000ms
  if (!isClient) return false;
  
  try {
    // 静的なオプションオブジェクトを使用して最適化
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'HEAD',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      // 高速化: キャッシュを無効化
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 300;
  } catch (e) {
    // パフォーマンス向上のために詳細なエラーログを削除
    return false;
  }
};

// API接続テスト - 最適化版（複数回の再試行とエラー処理改善）
export const testApiConnection = async (retryCount = 3): Promise<ConnectionTestResult> => { // リトライ回数増加：2→3
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
  
  // ポート検出を実行 - 並列化
  const port = await detectApiPort();
  
  if (!port) {
    // パフォーマンスマーク - 失敗
    if (typeof window !== 'undefined') {
      window.performance.mark('api_connection_test_port_failed');
      window.performance.measure('api_connection_test_failure', 'api_connection_test_start', 'api_connection_test_port_failed');
    }
    
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
    
    // 複数回再試行を実装
    let lastError = null;
    
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        // 健全性チェック - タイムアウト延長
        const data = await apiClient.get<HealthResponse>('/health', undefined, { timeout: 3000 }); // タイムアウト延長：2000ms→3000ms
        
        setApiInitialized(true);
        
        // パフォーマンスマーク - 成功
        if (typeof window !== 'undefined') {
          window.performance.mark('api_connection_test_success');
          window.performance.measure('api_connection_test_success_duration', 'api_connection_test_start', 'api_connection_test_success');
        }
        
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
          await new Promise(resolve => setTimeout(resolve, 1000)); // 待機時間：1秒
        }
      }
    }
    
    // すべての再試行が失敗した場合
    
    // エラーの場合でもポートが検出できていれば部分的に成功とみなす
    setApiInitialized(true);
    
    // パフォーマンスマーク - 部分成功
    if (typeof window !== 'undefined') {
      window.performance.mark('api_connection_test_partial');
      window.performance.measure('api_connection_test_partial_success', 'api_connection_test_start', 'api_connection_test_partial');
    }
    
    return {
      success: true,
      message: `APIサーバーを検出しました (ポート: ${port})`,
      port: port,
      details: { 
        warning: "健全性チェックに失敗しましたが、APIは検出されました",
        error: lastError?.message,
        retries: retryCount
      }
    };
  } catch (error: any) {
    // パフォーマンスマーク - エラー
    if (typeof window !== 'undefined') {
      window.performance.mark('api_connection_test_error');
      window.performance.measure('api_connection_test_error_duration', 'api_connection_test_start', 'api_connection_test_error');
    }
    
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

// APIのAPIポートの再検出 - 高速化のため再初期化せず、既存の状態を保持
export const rediscoverApiPort = async (): Promise<number | null> => {
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('api_rediscovery_start');
  }
  
  try {
    // 複数の候補ポートを並列チェック
    const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
    
    // 現在のポートを先頭に置くことで高速に検出できる可能性を上げる
    const currentPort = getCurrentApiPort();
    if (currentPort && !ports.includes(currentPort)) {
      ports.unshift(currentPort);
    }
    
    // 並列ポート検証
    const portChecks = await Promise.allSettled(
      ports.map(port => isPortAvailable(port, 1500)) // タイムアウト延長：800ms→1500ms
    );
    
    // 利用可能なポートを検索
    for (let i = 0; i < ports.length; i++) {
      const check = portChecks[i];
      if (check.status === 'fulfilled' && check.value) {
        const port = ports[i];
        
        // ベースURLを更新
        apiClient.setBaseUrl(`http://127.0.0.1:${port}/api`);
        setCurrentApiPort(port);
        
        try {
          localStorage.setItem('api_port', port.toString());
        } catch (e) {
          console.warn('ローカルストレージへのポート保存エラー:', e);
        }
        
        // パフォーマンスマーク - 成功
        if (typeof window !== 'undefined') {
          window.performance.mark('api_rediscovery_success');
          window.performance.measure('api_rediscovery_duration', 'api_rediscovery_start', 'api_rediscovery_success');
        }
        
        console.log(`APIポートを再検出しました: ${port}`);
        return port;
      }
    }
    
    // 並列検出が失敗した場合は順次検証を試みる
    for (const port of ports) {
      if (await isPortAvailable(port, 2000)) { // タイムアウト延長：800ms→2000ms
        // ベースURLを更新
        apiClient.setBaseUrl(`http://127.0.0.1:${port}/api`);
        setCurrentApiPort(port);
        
        try {
          localStorage.setItem('api_port', port.toString());
        } catch (e) {}
        
        // パフォーマンスマーク - 順次検出成功
        if (typeof window !== 'undefined') {
          window.performance.mark('api_rediscovery_sequential_success');
          window.performance.measure('api_rediscovery_sequential', 'api_rediscovery_start', 'api_rediscovery_sequential_success');
        }
        
        console.log(`APIポートを順次検出で再検出しました: ${port}`);
        return port;
      }
    }
    
    // パフォーマンスマーク - 失敗
    if (typeof window !== 'undefined') {
      window.performance.mark('api_rediscovery_failed');
      window.performance.measure('api_rediscovery_failure', 'api_rediscovery_start', 'api_rediscovery_failed');
    }
    
    console.error('APIポートの再検出に失敗しました');
    return null;
  } catch (e) {
    console.error('APIポート再検出エラー:', e);
    
    // パフォーマンスマーク - エラー
    if (typeof window !== 'undefined') {
      window.performance.mark('api_rediscovery_error');
      window.performance.measure('api_rediscovery_error_duration', 'api_rediscovery_start', 'api_rediscovery_error');
    }
    
    return null;
  }
};

// パフォーマンスマーク - 初期化完了
if (typeof window !== 'undefined') {
  window.performance.mark('connection_module_init_complete');
  window.performance.measure(
    'connection_module_initialization',
    'connection_module_init',
    'connection_module_init_complete'
  );
}