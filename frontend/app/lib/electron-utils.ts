// app/lib/electron-utils.ts

/**
 * Electron IPC通信の共通リスナー設定ユーティリティ
 * 
 * page.tsxとuseProjects.tsの両方で使用される重複したコードを一元管理する
 */
export interface IpcCallbacks {
    onConnectionEstablished: (data: { port: number, apiUrl: string }) => void;
    onServerDown: (data: { message: string }) => void;
    onServerRestarted: (data: { port: number, apiUrl: string }) => void;
  }
  
  /**
   * Electron IPCイベントリスナーをセットアップする
   * @param callbacks イベント発生時のコールバック関数群
   * @returns クリーンアップ関数（登録したリスナーを削除するために使用）
   */
  export const setupIpcListeners = (callbacks: IpcCallbacks) => {
    // クライアントサイドのみの処理を判定
    if (typeof window === 'undefined' || !window.electron || !window.electron.ipcRenderer) {
      return undefined;
    }
  
    // 各イベントリスナーを登録
    const removeConnectionListener = window.electron.ipcRenderer.on(
      'api-connection-established',
      callbacks.onConnectionEstablished
    );
    
    const removeServerDownListener = window.electron.ipcRenderer.on(
      'api-server-down',
      callbacks.onServerDown
    );
    
    const removeServerRestartListener = window.electron.ipcRenderer.on(
      'api-server-restarted',
      callbacks.onServerRestarted
    );
    
    // すべてのリスナーを削除するクリーンアップ関数を返す
    return () => {
      if (removeConnectionListener) removeConnectionListener();
      if (removeServerDownListener) removeServerDownListener();
      if (removeServerRestartListener) removeServerRestartListener();
    };
  };