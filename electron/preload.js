const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// アプリケーションからアクセスできるAPIを提供
contextBridge.exposeInMainWorld('electron', {
  // アプリケーションパスを取得
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // ファイルシステム機能
  fs: {
    // ファイルを読み込む
    readFile: (filePath, options) => {
      return fs.promises.readFile(filePath, options);
    },
    
    // ファイルを書き込む
    writeFile: (filePath, data, options) => {
      return fs.promises.writeFile(filePath, data, options);
    },
    
    // ディレクトリを作成
    mkdir: (dirPath, options) => {
      return fs.promises.mkdir(dirPath, { recursive: true, ...options });
    },
    
    // ファイルの存在確認
    exists: (path) => {
      return fs.existsSync(path);
    },
    
    // ディレクトリの内容を取得
    readdir: (dirPath, options) => {
      return fs.promises.readdir(dirPath, options);
    }
  },
  
  // パスユーティリティ
  path: {
    join: (...args) => path.join(...args),
    dirname: (filePath) => path.dirname(filePath),
    basename: (filePath) => path.basename(filePath)
  }
});