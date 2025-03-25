/**
 * 環境検出ユーティリティ - 簡素化版
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