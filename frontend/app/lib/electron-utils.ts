// Electron IPC通信の共通リスナー設定ユーティリティ
import { isClient, isElectronEnvironment } from './utils/environment';

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

/**
 * Electron IPCイベントリスナーをセットアップする
 * 
 * @param callbacks イベント発生時のコールバック関数群
 * @returns クリーンアップ関数（登録したリスナーを削除するために使用）
 */
export const setupIpcListeners = (callbacks: IpcCallbacks): (() => void) | undefined => {
  // クライアントサイドの環境チェック
  if (!isClient || !isElectronEnvironment()) {
    console.log('Electronディスパッチャの初期化をスキップ: 対象環境ではありません');
    return undefined;
  }
  
  console.log('Electronディスパッチャの初期化: リスナーを登録');
  
  // 接続確立イベントのリスナー登録
  const removeConnectionListener = window.electron?.ipcRenderer.on(
    'api-connection-established',
    callbacks.onConnectionEstablished
  );
  
  // サーバーダウンイベントのリスナー登録 
  const removeServerDownListener = window.electron?.ipcRenderer.on(
    'api-server-down',
    callbacks.onServerDown
  );
  
  // サーバー再起動イベントのリスナー登録
  const removeServerRestartListener = window.electron?.ipcRenderer.on(
    'api-server-restarted',
    callbacks.onServerRestarted
  );
  
  // リスナー削除のためのクリーンアップ関数を返す
  return () => {
    console.log('Electronディスパッチャのクリーンアップ: リスナーを解除');
    if (removeConnectionListener) removeConnectionListener();
    if (removeServerDownListener) removeServerDownListener();
    if (removeServerRestartListener) removeServerRestartListener();
  };
};