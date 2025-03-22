// electron-utils.ts
// Electron IPC通信の共通リスナー設定ユーティリティ - 最適化版
// 以下の行を変更
// import { isClient, isElectronEnvironment } from './utils/environment';
// 代わりに直接判定するコードを使用
const isClient = typeof window !== 'undefined';

// Electron環境判定（簡略化）
const isElectronEnvironment = () => {
  if (!isClient) return false;
  return typeof window.electron !== 'undefined' || window.electronReady === true;
};

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('electron_utils_init');
}

/**
 * IPC コールバック関数の型定義
 */
export interface IpcCallbacks {
  /**
   * API接続が確立されたときのコールバック
   */
  onConnectionEstablished: (data: { port: number, apiUrl: string }) => void;
  
  /**
   * APIサーバーが応答しなくなったときのコールバック
   */
  onServerDown: (data: { message: string }) => void;
  
  /**
   * APIサーバーが再起動されたときのコールバック
   */
  onServerRestarted: (data: { port: number, apiUrl: string }) => void;
}

// リスナー登録状態の追跡
let listenersRegistered = false;
let cleanup: (() => void) | undefined = undefined;

/**
 * Electron IPCイベントリスナーをセットアップする - 最適化版
 * 
 * @param callbacks イベント発生時のコールバック関数群
 * @returns クリーンアップ関数（登録したリスナーを削除するために使用）
 */
export const setupIpcListeners = (callbacks: IpcCallbacks): (() => void) | undefined => {
  // クライアントサイドの環境チェック
  if (!isClient || !isElectronEnvironment()) {
    return undefined;
  }
  
  // 既にリスナーが登録されていれば既存のクリーンアップ関数を返す
  if (listenersRegistered && cleanup) {
    return cleanup;
  }
  
  // パフォーマンスマーク
  if (typeof window !== 'undefined') {
    window.performance.mark('electron_ipc_setup_start');
  }
  
  // window.electronが存在するかチェック
  if (!window.electron?.ipcRenderer?.on) {
    console.warn('Electron IPC機能が利用できません - ipcRenderer.onが見つかりません');
    return undefined;
  }
  
  try {
    // 接続確立イベントのリスナー登録
    const removeConnectionListener = window.electron.ipcRenderer.on(
      'api-connection-established',
      callbacks.onConnectionEstablished
    );
    
    // サーバーダウンイベントのリスナー登録 
    const removeServerDownListener = window.electron.ipcRenderer.on(
      'api-server-down',
      callbacks.onServerDown
    );
    
    // サーバー再起動イベントのリスナー登録
    const removeServerRestartListener = window.electron.ipcRenderer.on(
      'api-server-restarted',
      callbacks.onServerRestarted
    );
    
    // リスナー登録状態を更新
    listenersRegistered = true;
    
    // リスナー削除のためのクリーンアップ関数
    cleanup = () => {
      console.log('Electronディスパッチャのクリーンアップ: リスナーを解除');
      if (removeConnectionListener) removeConnectionListener();
      if (removeServerDownListener) removeServerDownListener();
      if (removeServerRestartListener) removeServerRestartListener();
      listenersRegistered = false;
      cleanup = undefined;
    };
    
    // パフォーマンスマーク - 成功
    if (typeof window !== 'undefined') {
      window.performance.mark('electron_ipc_setup_complete');
      window.performance.measure(
        'electron_ipc_setup_duration',
        'electron_ipc_setup_start',
        'electron_ipc_setup_complete'
      );
    }
    
    return cleanup;
  } catch (error) {
    console.error('Electron IPCリスナー設定エラー:', error);
    
    // パフォーマンスマーク - エラー
    if (typeof window !== 'undefined') {
      window.performance.mark('electron_ipc_setup_error');
      window.performance.measure(
        'electron_ipc_setup_error_duration',
        'electron_ipc_setup_start',
        'electron_ipc_setup_error'
      );
    }
    
    return undefined;
  }
};

// パフォーマンスマーク - 初期化完了
if (typeof window !== 'undefined') {
  window.performance.mark('electron_utils_init_complete');
  window.performance.measure(
    'electron_utils_initialization',
    'electron_utils_init',
    'electron_utils_init_complete'
  );
}