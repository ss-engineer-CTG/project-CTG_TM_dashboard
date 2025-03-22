/**
 * 環境検出ユーティリティ
 * アプリケーション全体で一貫した環境検出ロジックを提供します
 */

// クライアントサイドかどうかを判定（window オブジェクトの存在で判定）
export const isClient = typeof window !== 'undefined';

/**
 * キャッシュとタイムアウト付きのより堅牢なElectron環境検出
 */
let _isElectronEnv: boolean | null = null;
let _detectionAttempts = 0;

/**
 * Electron環境かどうかを判定
 * クライアントサイドでのみ動作し、複数の検出方法を組み合わせて判定
 */
export const isElectronEnvironment = (): boolean => {
  if (!isClient) return false;
  
  // 既に検出済みならキャッシュした結果を返す
  if (_isElectronEnv !== null) return _isElectronEnv;
  
  // 検出回数制限（最大3回）
  if (_detectionAttempts >= 3) {
    // デフォルト値を返す（最後に試行した結果）
    return _isElectronEnv || false;
  }
  _detectionAttempts++;

  // 主に window.electron の存在で判定
  const hasElectronAPI = typeof window.electron !== 'undefined' && window.electron !== null;
  
  // バックアップとして他の方法も試す
  const hasElectronFlag = window.electronReady === true;
  const hasUserAgent = typeof navigator !== 'undefined' && 
                      navigator.userAgent.toLowerCase().indexOf('electron') > -1;
  
  _isElectronEnv = hasElectronAPI || hasElectronFlag || hasUserAgent;
  
  // デバッグログ（3回ごとに出力を減らす）
  if (_detectionAttempts % 3 === 1 || _detectionAttempts <= 2) {
    console.log('Electron環境検出詳細:', {
      hasElectronAPI,
      hasElectronFlag, 
      hasUserAgent,
      userAgent: navigator.userAgent,
      finalResult: _isElectronEnv,
      electronProps: hasElectronAPI ? Object.keys(window.electron) : [],
      detectionAttempt: _detectionAttempts
    });
  }
  
  return _isElectronEnv;
};

/**
 * APIクライアントの初期化状態
 */
let _apiInitialized = false;

/**
 * APIクライアントの初期化状態を取得
 */
export const getApiInitialized = (): boolean => {
  if (!isClient) return false;
  return _apiInitialized || !!window.apiInitialized;
};

/**
 * APIクライアントの初期化状態を設定
 */
export const setApiInitialized = (value: boolean): void => {
  _apiInitialized = value;
  if (isClient) {
    window.apiInitialized = value;
  }
};

/**
 * 現在のAPIポートを取得
 */
export const getCurrentApiPort = (): number | undefined => {
  if (!isClient) return undefined;
  return window.currentApiPort;
};

/**
 * 現在のAPIポートを設定
 */
export const setCurrentApiPort = (port: number): void => {
  if (!isClient) return;
  window.currentApiPort = port;
};