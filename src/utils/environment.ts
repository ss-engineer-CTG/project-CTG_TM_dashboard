/**
 * 環境検出ユーティリティ
 * アプリケーション全体で一貫した環境検出ロジックを提供します
 */

// クライアントサイドかどうかを判定
export const isClient = typeof window !== 'undefined';

/**
 * Electron環境かどうかを判定
 * クライアントサイドでのみ動作
 */
export const isElectronEnvironment = (): boolean => {
  if (!isClient) return false;
  return typeof window.electron !== 'undefined' && window.electron !== null;
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

/**
 * アプリパス取得
 */
export const getAppPath = async (): Promise<string> => {
  if (isElectronEnvironment()) {
    try {
      return await window.electron!.getAppPath();
    } catch (e) {
      console.error('アプリパス取得エラー:', e);
    }
  }
  return '';
};

/**
 * ファイルパス解決 - 常に相対パスを使用
 */
export const resolveFilePath = (relativePath: string): string => {
  if (isElectronEnvironment()) {
    // 常に相対パスベースで解決（開発/本番同一ロジック）
    return `./${relativePath}`.replace(/\\/g, '/');
  }
  return relativePath;
};