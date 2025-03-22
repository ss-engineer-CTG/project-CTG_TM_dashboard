const { contextBridge, ipcRenderer } = require('electron');

// 初期化パフォーマンス計測
const preloadStartTime = Date.now();
console.log('Preload script starting...');

// 高速起動フラグ
let ipcInitialized = false;
let documentReady = false;

/**
 * Electron環境変数を安全に設定する関数
 */
const setElectronReady = () => {
  window.electronReady = true;
  window.currentApiPort = null;
  window.apiInitialized = false;
  
  // 初期化完了イベントを発行
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      document.dispatchEvent(new Event('electron-ready'));
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.dispatchEvent(new Event('electron-ready'));
      });
    }
    
    // カスタムイベントでより詳細な情報を提供
    document.dispatchEvent(
      new CustomEvent('app-init', { 
        detail: { 
          isElectron: true,
          time: Date.now(),
          ready: true
        } 
      })
    );
  } catch (e) {
    console.error('イベント発行エラー:', e);
  }
};

// DOMContentLoadedイベントの高速検出
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    documentReady = true;
    initializeElectronBridge();
  });
} else {
  // すでにDOMContentLoadedイベントが発生している場合
  documentReady = true;
  setTimeout(initializeElectronBridge, 0);
}

// 早期初期化関数
function initializeElectronBridge() {
  if (ipcInitialized) return;
  ipcInitialized = true;
  
  console.log(`DOM ready, initializing Electron bridge (${Date.now() - preloadStartTime}ms)`);
  
  // レンダラープロセスにElectron APIが準備完了したことを通知
  try {
    document.dispatchEvent(new Event('electron-ready'));
    
    // パフォーマンスマーク記録
    if (window.performance && window.performance.mark) {
      window.performance.mark('electron_bridge_initialized');
    }
    
    // 早期ロード通知
    document.dispatchEvent(
      new CustomEvent('app-init', { 
        detail: { 
          isElectron: true,
          time: Date.now(),
          ready: true
        } 
      })
    );
    
    // 新規追加: 初期化完了ステータスをコンソールに出力
    console.log('Electron bridge initialized successfully');
  } catch (e) {
    console.error('初期化イベント発行エラー:', e);
  }
}

// 安全なIPCチャンネルリスト
const validChannels = [
  'api-connection-established',
  'api-server-down',
  'api-server-restarted',
  'app-initializing'
];

// 高速キャッシュ管理
function optimizeCacheManagement() {
  if (typeof localStorage !== 'undefined') {
    try {
      // 古いキャッシュをクリーンアップ - 非同期で実行
      setTimeout(() => {
        try {
          const now = Date.now();
          const maxAge = 7 * 24 * 60 * 60 * 1000; // 1週間
          
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('_timestamp')) {
              const timestamp = parseInt(localStorage.getItem(key));
              if (isNaN(timestamp) || (now - timestamp > maxAge)) {
                const dataKey = key.replace('_timestamp', '');
                localStorage.removeItem(key);
                localStorage.removeItem(dataKey);
              }
            }
          }
        } catch (e) {}
      }, 5000); // 5秒後に実行
    } catch (e) {}
  }
}

// メインプロセスとレンダラープロセス間の安全な通信を提供（高速化）
contextBridge.exposeInMainWorld('electron', {
  // Electron識別フラグ - 明示的に追加
  isElectron: true,
  
  // アプリケーションパスを取得
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // APIベースURLを取得
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
  
  // 一時ディレクトリのパスを取得
  getTempPath: () => ipcRenderer.invoke('get-temp-path'),
  
  // ファイルシステム操作 - 高速化版
  fs: {
    exists: (path) => ipcRenderer.invoke('fs:exists', path),
    readFile: (path, options) => ipcRenderer.invoke('fs:readFile', path, options),
    writeFile: (filePath, data, options) => ipcRenderer.invoke('fs:writeFile', filePath, data, options),
    mkdir: (dirPath, options) => ipcRenderer.invoke('fs:mkdir', dirPath, options),
    readdir: (dirPath, options) => ipcRenderer.invoke('fs:readdir', dirPath, options)
  },
  
  // パス操作 - 並列処理対応
  path: {
    join: (...args) => ipcRenderer.invoke('path:join', ...args),
    dirname: (filePath) => ipcRenderer.invoke('path:dirname', filePath),
    basename: (filePath) => ipcRenderer.invoke('path:basename', filePath)
  },
  
  // ダイアログ操作 - エラーハンドリング強化
  dialog: {
    openCSVFile: (defaultPath) => {
      return ipcRenderer.invoke('dialog:openCSVFile', defaultPath)
        .catch(err => {
          console.error('dialog:openCSVFile IPC error:', err);
          return {
            success: false,
            message: `IPCエラー: ${err.message || 'Unknown error'}`,
            path: null
          };
        });
    }
  },
  
  // テスト用のダイアログ関数
  testDialog: () => {
    return ipcRenderer.invoke('dialog:test')
      .catch(err => {
        console.error('dialog:test IPC error:', err);
        return {
          success: false,
          error: err.message || 'Unknown error'
        };
      });
  },
  
  // 環境変数
  env: {
    isElectron: true,  // 追加：明示的なフラグ
    apiUrl: process.env.API_URL || null,
    startTime: preloadStartTime
  },
  
  // IPCレンダラー - イベントリスナー（拡張版）
  ipcRenderer: {
    on: (channel, callback) => {
      if (validChannels.includes(channel)) {
        const subscription = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      } else {
        console.warn(`Channel "${channel}" is not authorized for IPC communication`);
        return () => {};
      }
    }
  },
  
  // 新規追加: 起動診断情報を提供
  diagnostics: {
    getStartupTime: () => preloadStartTime,
    isInitialized: () => ipcInitialized,
    checkApiConnection: async () => {
      try {
        const baseUrl = await ipcRenderer.invoke('get-api-base-url');
        return { 
          available: true, 
          baseUrl,
          timestamp: Date.now()
        };
      } catch (e) {
        return { 
          available: false, 
          error: e.message 
        };
      }
    }
  }
});

// Electronが明示的に初期化されたことを示す変数を設定
setElectronReady();

// レンダリングプロセスのパフォーマンスを向上
try {
  // IDB高速ロード用空実行
  const dbRequest = indexedDB.open('performance_cache', 1);
  dbRequest.onupgradeneeded = () => {};
  dbRequest.onsuccess = () => {};
  dbRequest.onerror = () => {};
} catch (e) {}

// キャッシュ最適化を実行 - 遅延実行
setTimeout(optimizeCacheManagement, 2000);

// 準備完了ログ
console.log(`Preload script completed in ${Date.now() - preloadStartTime}ms`);

// パフォーマンス計測を実施
if (window.performance && window.performance.mark) {
  window.performance.mark('preload_complete');
}