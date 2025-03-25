const { contextBridge, ipcRenderer } = require('electron');

// 初期化パフォーマンス計測
const preloadStartTime = Date.now();
console.log('Preload script starting...');

// 高速起動フラグ
let ipcInitialized = false;
let documentReady = false;

// 開発モードかどうか
const isDev = process.env.NODE_ENV === 'development' || 
              process.defaultApp || 
              /electron/.test(process.execPath);

/**
 * Electron環境変数を安全に設定する関数 - DOM状態を考慮した実装
 */
const setElectronReady = () => {
  // グローバルフラグを設定
  window.electronReady = true;
  window.currentApiPort = null;
  window.apiInitialized = false;
  
  // DOM状態に応じたメタタグ追加の処理
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
    if (!safelyAddMetaTag()) {
      // 失敗した場合は短い遅延後に再試行
      setTimeout(() => {
        safelyAddMetaTag();
        try {
          document.dispatchEvent(new Event('electron-ready'));
        } catch (e) {
          console.error('イベント発行エラー:', e);
        }
      }, 50);
    } else {
      try {
        document.dispatchEvent(new Event('electron-ready'));
      } catch (e) {
        console.error('イベント発行エラー:', e);
      }
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
  'startup-progress'
];

// メインプロセスとレンダラープロセス間の安全な通信を提供
contextBridge.exposeInMainWorld('electron', {
  // Electron識別フラグ - 明示的に追加
  isElectron: true,
  
  // アプリケーションパスを取得
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // APIベースURLを取得
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
  
  // 一時ディレクトリのパスを取得
  getTempPath: () => ipcRenderer.invoke('get-temp-path'),
  
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
  
  // API通信ブリッジ - 新規追加
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
  }
});

// 開発モードでのみ - デベロッパーツールショートカット
if (isDev) {
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

// 準備完了ログ
console.log(`Preload script completed in ${Date.now() - preloadStartTime}ms`);