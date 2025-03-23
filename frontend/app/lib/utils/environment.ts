/**
 * 環境検出ユーティリティ
 * アプリケーション全体で一貫した環境検出ロジックを提供します
 */

// クライアントサイドかどうかを判定（window オブジェクトの存在で判定）
export const isClient = typeof window !== 'undefined';

/**
 * Electron環境かどうかを判定するための状態管理
 */
let _isElectronEnv: boolean | null = null;
let _detectionAttempts = 0;

/**
 * 検出結果の初期値を設定（DOMロード前にチェック）
 */
if (isClient) {
  // 事前設定されたフラグがあれば優先使用
  if (typeof window.electronReady === 'boolean') {
    _isElectronEnv = window.electronReady;
    console.log('環境検出: 事前設定されたフラグを使用:', _isElectronEnv);
  }
}

/**
 * Electron環境かどうかを判定
 * クライアントサイドでのみ動作し、複数の検出方法を組み合わせて判定
 */
export const isElectronEnvironment = (): boolean => {
  if (!isClient) return false;
  
  // 既に検出済みならキャッシュした結果を返す
  if (_isElectronEnv !== null) return _isElectronEnv;
  
  // 検出回数記録
  _detectionAttempts++;

  // 主要検出ロジック
  const detectEnvironment = (): boolean => {
    // 1. window.electronReady フラグを確認（明示的に設定されたフラグ）
    if (typeof window.electronReady === 'boolean') {
      return window.electronReady;
    }
    
    // 2. window.electron API の存在確認（最も信頼性高い）
    const hasElectronAPI = typeof window.electron !== 'undefined' && window.electron !== null;
    
    // 3. ユーザーエージェントでの確認（フォールバック）
    const hasUserAgent = typeof navigator !== 'undefined' && 
                         navigator.userAgent.toLowerCase().indexOf('electron') > -1;
    
    // 4. electron-ready イベントの検出確認
    let hasElectronReadyEvent = false;
    try {
      if (document.querySelector('meta[name="electron-ready"]')) {
        hasElectronReadyEvent = true;
      }
    } catch (e) {
      /* エラーを無視 */
    }
    
    // 結果をコンソールにログ出力（デバッグ用）
    console.log('Electron環境検出詳細:', {
      electronReadyFlag: typeof window.electronReady === 'boolean' ? window.electronReady : 'undefined',
      hasElectronAPI,
      hasUserAgent,
      hasElectronReadyEvent,
      detectionAttempt: _detectionAttempts
    });
    
    // 環境検出結果の決定 - いずれかの検出方法で見つかれば true
    return hasElectronAPI || hasUserAgent || hasElectronReadyEvent || typeof window.electronReady === 'boolean';
  };
  
  // 環境検出実行と結果のキャッシュ
  _isElectronEnv = detectEnvironment();
  
  // 明示的にグローバルフラグを設定（別の検出ロジックとの整合性のため）
  if (window.electron && _isElectronEnv) {
    window.electronReady = true;
  }
  
  // 結果をログ出力
  if (_detectionAttempts === 1) {
    console.log(`Electron環境検出結果: ${_isElectronEnv ? 'はい' : 'いいえ'}`);
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