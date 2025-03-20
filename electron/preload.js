const { contextBridge, ipcRenderer } = require('electron');

// 詳細なデバッグログを追加
console.log('Electron preload script starting...');

// 安全なIPCチャンネルリスト
const validChannels = [
  'api-connection-established',
  'api-server-down',
  'api-server-restarted'
];

// Electron APIの初期化完了イベントの発行
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM content loaded, triggering electron-ready event');
  document.dispatchEvent(new Event('electron-ready'));
});

// メインプロセスとレンダラープロセス間の安全な通信を提供
contextBridge.exposeInMainWorld('electron', {
  // アプリケーションパスを取得
  getAppPath: () => {
    console.log('Calling getAppPath via IPC');
    return ipcRenderer.invoke('get-app-path');
  },
  
  // APIベースURLを取得
  getApiBaseUrl: () => {
    console.log('Calling getApiBaseUrl via IPC');
    return ipcRenderer.invoke('get-api-base-url');
  },
  
  // 一時ディレクトリのパスを取得
  getTempPath: () => {
    console.log('Calling getTempPath via IPC');
    return ipcRenderer.invoke('get-temp-path');
  },
  
  // ファイルシステム操作
  fs: {
    exists: (path) => {
      console.log('Calling fs:exists via IPC', { path });
      return ipcRenderer.invoke('fs:exists', path);
    },
    readFile: (path, options) => {
      console.log('Calling fs:readFile via IPC', { path, options });
      return ipcRenderer.invoke('fs:readFile', path, options);
    },
    writeFile: (filePath, data, options) => {
      console.log('Calling fs:writeFile via IPC', { filePath, options });
      return ipcRenderer.invoke('fs:writeFile', filePath, data, options);
    },
    mkdir: (dirPath, options) => {
      console.log('Calling fs:mkdir via IPC', { dirPath, options });
      return ipcRenderer.invoke('fs:mkdir', dirPath, options);
    },
    readdir: (dirPath, options) => {
      console.log('Calling fs:readdir via IPC', { dirPath, options });
      return ipcRenderer.invoke('fs:readdir', dirPath, options);
    }
  },
  
  // パス操作
  path: {
    join: (...args) => {
      console.log('Calling path:join via IPC', { args });
      return ipcRenderer.invoke('path:join', ...args);
    },
    dirname: (filePath) => {
      console.log('Calling path:dirname via IPC', { filePath });
      return ipcRenderer.invoke('path:dirname', filePath);
    },
    basename: (filePath) => {
      console.log('Calling path:basename via IPC', { filePath });
      return ipcRenderer.invoke('path:basename', filePath);
    }
  },
  
  // ダイアログ操作 - 強化バージョン
  dialog: {
    openCSVFile: (defaultPath) => {
      console.log('Calling dialog:openCSVFile via IPC', { defaultPath });
      return ipcRenderer.invoke('dialog:openCSVFile', defaultPath)
        .catch(err => {
          console.error('dialog:openCSVFile IPC error:', err);
          // エラーが発生した場合でも結果オブジェクトを返す
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
    console.log('Calling dialog:test via IPC');
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
    isElectron: true,
    apiUrl: process.env.API_URL || null
  },
  
  // IPCレンダラー - イベントリスナー
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

// 公開済みの機能を一覧表示
const exposedAPIs = {
  appPath: typeof ipcRenderer.invoke === 'function',
  apiBaseUrl: typeof ipcRenderer.invoke === 'function',
  tempPath: typeof ipcRenderer.invoke === 'function',
  fs: true,
  path: true,
  dialog: true,
  testDialog: true,
  env: true,
  ipcRenderer: true
};

// 準備完了ログ
console.log('Electron preload script loaded successfully');
console.log('Exposed APIs:', exposedAPIs);