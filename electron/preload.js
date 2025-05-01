const { contextBridge, ipcRenderer } = require('electron');

// 初期化パフォーマンス計測
const preloadStartTime = Date.now();
console.log('Preload script starting...');

// 高速起動フラグ
let ipcInitialized = false;
let documentReady = false;

// 環境検出の結果をキャッシュ
const IS_DEV_MODE = (() => {
  try {
    return process.env.NODE_ENV === 'development' || 
           process.defaultApp || 
           /electron/.test(process.execPath);
  } catch (e) {
    console.warn('開発モード検出エラー:', e);
    return false; // エラー時は安全に開発モードではないと判断
  }
})();

/**
 * Electron環境変数を安全に設定する関数 - DOM状態を考慮した実装
 */
const setElectronReady = () => {
  // グローバルフラグを設定
  window.electronReady = true;
  window.currentApiPort = null;
  window.apiInitialized = false;
  window.systemHealth = {  // 新しいシステム健全性情報
    status: 'initializing',
    progress: 0,
    lastChecked: Date.now()
  };
  
  // DOM状態に応じたメタタグ追加の処理 - 最適化版
  const safelyAddMetaTag = () => {
    if (document && document.head) {
      try {
        // 既存のメタタグをチェック
        let meta = document.querySelector('meta[name="electron-ready"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'electron-ready';
          meta.content = 'true';
          document.head.appendChild(meta);
        }
        return true;
      } catch (e) {
        console.error('メタタグ設定エラー:', e);
        return false;
      }
    }
    return false;
  };

  // DOMの状態に応じた処理
  if (document.readyState === 'loading') {
    // DOMがまだロード中の場合は、完了イベントを待つ
    document.addEventListener('DOMContentLoaded', () => {
      safelyAddMetaTag();
      document.dispatchEvent(new Event('electron-ready'));
    });
  } else {
    // すでにDOMが読み込まれている場合は直接実行を試みる
    safelyAddMetaTag();
    try {
      document.dispatchEvent(new Event('electron-ready'));
    } catch (e) {
      console.error('イベント発行エラー:', e);
    }
  }
  
  // 明示的に情報をログ出力
  console.log('Electron環境フラグをセットアップしました:', { 
    electronReady: window.electronReady,
    time: Date.now() - preloadStartTime
  });
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
  'app-initializing',
  'app-error',
  'build-progress',
  'startup-progress',
  'shortcut-refresh-data',
  'shortcut-select-file'
];

// メインプロセスとレンダラープロセス間の安全な通信を提供 - 最適化版
contextBridge.exposeInMainWorld('electron', {
  // Electron識別フラグ - 明示的に追加
  isElectron: true,
  
  // アプリケーションパスを取得
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // APIベースURLを取得
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
  
  // 一時ディレクトリのパスを取得
  getTempPath: () => ipcRenderer.invoke('get-temp-path'),
  
  // APIシステム健全性情報を取得
  getSystemHealth: () => {
    return window.systemHealth || {
      status: 'unknown',
      progress: 0,
      lastChecked: Date.now()
    };
  },
  
  // APIシステム健全性情報を更新
  updateSystemHealth: (data) => {
    window.systemHealth = {
      ...window.systemHealth,
      ...data,
      lastChecked: Date.now()
    };
  },
  
  // システム健全性の状態を確認
  checkSystemHealth: () => ipcRenderer.invoke('get-system-health'),
  
  // ファイルシステム操作
  fs: {
    exists: (path) => ipcRenderer.invoke('fs:exists', path),
    readFile: (path, options) => ipcRenderer.invoke('fs:readFile', path, options),
    writeFile: (filePath, data, options) => ipcRenderer.invoke('fs:writeFile', filePath, data, options),
    mkdir: (dirPath, options) => ipcRenderer.invoke('fs:mkdir', dirPath, options),
    readdir: (dirPath, options) => ipcRenderer.invoke('fs:readdir', dirPath, options),
    openPath: (path) => ipcRenderer.invoke('fs:openPath', path),
    validatePath: (path) => ipcRenderer.invoke('fs:validatePath', path)
  },
  
  // パス操作
  path: {
    join: (...args) => ipcRenderer.invoke('path:join', ...args),
    dirname: (filePath) => ipcRenderer.invoke('path:dirname', filePath),
    basename: (filePath) => ipcRenderer.invoke('path:basename', filePath)
  },
  
  // ダイアログ操作
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
  
  // API通信ブリッジ
  api: {
    request: (method, path, params, data, options) => 
      ipcRenderer.invoke('api:request', method, path, params, data, options),
    
    get: (path, params, options) => 
      ipcRenderer.invoke('api:request', 'GET', path, params, null, options),
    
    post: (path, data, params, options) => 
      ipcRenderer.invoke('api:request', 'POST', path, params, data, options),
    
    put: (path, data, params, options) => 
      ipcRenderer.invoke('api:request', 'PUT', path, params, data, options),
    
    delete: (path, params, options) => 
      ipcRenderer.invoke('api:request', 'DELETE', path, params, null, options)
  },
  
  // 環境変数
  env: {
    isElectron: true,
    apiUrl: null
  },
  
  // IPCレンダラー
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
  
  // ショートカット
  shortcuts: {
    onRefreshData: (callback) => {
      const subscription = () => callback();
      ipcRenderer.on('shortcut-refresh-data', subscription);
      return () => {
        ipcRenderer.removeListener('shortcut-refresh-data', subscription);
      };
    },
    onSelectFile: (callback) => {
      const subscription = () => callback();
      ipcRenderer.on('shortcut-select-file', subscription);
      return () => {
        ipcRenderer.removeListener('shortcut-select-file', subscription);
      };
    }
  }
});

// デバッグ機能を安定した環境検出に基づいて設定
if (IS_DEV_MODE) {
  window.addEventListener('keydown', (e) => {
    // F12でデベロッパーツールを開く
    if (e.key === 'F12') {
      ipcRenderer.send('toggle-devtools');
    }
    // F5で手動リロード
    if (e.key === 'F5') {
      window.location.reload();
    }
  });
}

// Electronが明示的に初期化されたことを示す変数を設定
setElectronReady();

// 定期的にシステム健全性を確認
if (typeof window !== 'undefined') {
  // 10秒ごとにシステム健全性を確認
  setInterval(async () => {
    try {
      const healthStatus = await ipcRenderer.invoke('get-system-health');
      window.systemHealth = {
        ...healthStatus,
        lastChecked: Date.now()
      };
    } catch (error) {
      console.warn('システム健全性の確認に失敗:', error);
    }
  }, 10000);
}

// 準備完了ログ
console.log(`Preload script completed in ${Date.now() - preloadStartTime}ms`);