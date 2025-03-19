const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// アプリケーションからアクセスできるAPIを提供
contextBridge.exposeInMainWorld('electron', {
  // アプリケーションパスを取得
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // APIベースURLを取得
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
  
  // 一時ディレクトリのパスを取得
  getTempPath: () => os.tmpdir(),
  
  // アプリ環境情報
  env: {
    isElectron: true,
    // 動的にAPIURLを設定するようにする
    get apiUrl() {
      // IPC経由で最新のURLを取得
      return ipcRenderer.invoke('get-api-base-url');
    }
  },
  
  // IPC通信
  ipcRenderer: {
    // イベントリスナーの登録
    on: (channel, callback) => {
      const validChannels = [
        'api-connection-established',
        'api-server-down'
      ];
      if (validChannels.includes(channel)) {
        const subscription = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      }
    },
    
    // イベントリスナーの削除
    removeListener: (channel, callback) => {
      const validChannels = [
        'api-connection-established',
        'api-server-down'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, callback);
      }
    }
  },
  
  // ファイルシステム機能
  fs: {
    // ファイルを読み込む
    readFile: async (filePath, options) => {
      try {
        return await fs.promises.readFile(filePath, options);
      } catch (error) {
        console.error(`ファイル読み込みエラー: ${filePath}`, error);
        if (error.code === 'EPERM') {
          throw new Error('ファイルへのアクセス権限がありません。管理者権限で実行するか、別のファイルを選択してください。');
        }
        throw error;
      }
    },
    
    // ファイルを書き込む
    writeFile: async (filePath, data, options) => {
      try {
        return await fs.promises.writeFile(filePath, data, options);
      } catch (error) {
        console.error(`ファイル書き込みエラー: ${filePath}`, error);
        if (error.code === 'EPERM') {
          throw new Error('ファイルへの書き込み権限がありません。管理者権限で実行するか、別のフォルダを選択してください。');
        }
        throw error;
      }
    },
    
    // ディレクトリを作成
    mkdir: async (dirPath, options) => {
      try {
        return await fs.promises.mkdir(dirPath, { recursive: true, ...options });
      } catch (error) {
        console.error(`ディレクトリ作成エラー: ${dirPath}`, error);
        if (error.code === 'EPERM') {
          throw new Error('ディレクトリの作成権限がありません。管理者権限で実行するか、別のフォルダを選択してください。');
        }
        throw error;
      }
    },
    
    // ファイルの存在確認
    exists: (pathToCheck) => {
      try {
        return fs.existsSync(pathToCheck);
      } catch (error) {
        console.error(`ファイル存在確認エラー: ${pathToCheck}`, error);
        return false;
      }
    },
    
    // ディレクトリの内容を取得
    readdir: async (dirPath, options) => {
      try {
        return await fs.promises.readdir(dirPath, options);
      } catch (error) {
        console.error(`ディレクトリ読み込みエラー: ${dirPath}`, error);
        if (error.code === 'EPERM') {
          throw new Error('ディレクトリへのアクセス権限がありません。管理者権限で実行するか、別のフォルダを選択してください。');
        }
        throw error;
      }
    }
  },
  
  // パスユーティリティ
  path: {
    join: (...args) => path.join(...args),
    dirname: (filePath) => path.dirname(filePath),
    basename: (filePath) => path.basename(filePath)
  },
  
  // OSユーティリティ
  os: {
    tmpdir: () => os.tmpdir(),
    homedir: () => os.homedir(),
    platform: () => process.platform
  },
  
  // ファイル選択ダイアログを追加
  dialog: {
    // CSVファイル選択ダイアログを表示
    openCSVFile: (defaultPath) => ipcRenderer.invoke('dialog:openCSVFile', defaultPath),
  }
});