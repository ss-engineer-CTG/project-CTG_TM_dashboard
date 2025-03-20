const { contextBridge, ipcRenderer } = require('electron');

// 安全なIPCチャンネルリスト
const validChannels = [
  'api-connection-established',
  'api-server-down',
  'api-server-restarted'
];

// メインプロセスとレンダラープロセス間の安全な通信を提供
contextBridge.exposeInMainWorld('electron', {
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
    readdir: (dirPath, options) => ipcRenderer.invoke('fs:readdir', dirPath, options)
  },
  
  // パス操作
  path: {
    join: (...args) => ipcRenderer.invoke('path:join', ...args),
    dirname: (filePath) => ipcRenderer.invoke('path:dirname', filePath),
    basename: (filePath) => ipcRenderer.invoke('path:basename', filePath)
  },
  
  // ダイアログ操作
  dialog: {
    openCSVFile: (defaultPath) => ipcRenderer.invoke('dialog:openCSVFile', defaultPath)
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

// 準備完了ログ
console.log('Electron preload script loaded successfully');