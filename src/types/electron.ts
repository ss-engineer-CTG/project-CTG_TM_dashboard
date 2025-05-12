// Electronの型定義
export interface ElectronAPI {
  // Electron識別フラグ
  isElectron: boolean;
  
  getAppPath: () => Promise<string>;
  getApiBaseUrl: () => Promise<string>;
  getTempPath: () => Promise<string>;
  
  // システム健全性関連を追加
  getSystemHealth: () => {
    status: string;
    progress: number;
    lastChecked: number;
    components?: Record<string, boolean>;
  };
  
  updateSystemHealth: (data: any) => void;
  checkSystemHealth: () => Promise<any>;
  
  fs: {
    readFile: (filePath: string, options?: any) => Promise<Uint8Array | string>;
    writeFile: (filePath: string, data: any, options?: any) => Promise<void>;
    mkdir: (dirPath: string, options?: any) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
    readdir: (dirPath: string, options?: any) => Promise<string[]>;
    validatePath: (path: string) => Promise<{
      success: boolean;
      normalizedPath?: string;
      exists?: boolean;
      type?: string;
      message?: string;
      error?: string;
      inputPath?: string;
    }>;
    openPath: (path: string) => Promise<{
      success: boolean;
      message: string;
      path?: string;
      error?: string;
    }>;
  };
  
  path: {
    join: (...args: string[]) => Promise<string>;
    dirname: (filePath: string) => Promise<string>;
    basename: (filePath: string) => Promise<string>;
  };
  
  dialog: {
    openCSVFile: (defaultPath?: string) => Promise<{
      success: boolean;
      message: string;
      path: string | null;
    }>;
  };
  
  // API通信ブリッジ
  api: {
    request: (method: string, path: string, params?: any, data?: any, options?: any) => Promise<any>;
    get: (path: string, params?: any, options?: any) => Promise<any>;
    post: (path: string, data?: any, params?: any, options?: any) => Promise<any>;
    put: (path: string, data?: any, params?: any, options?: any) => Promise<any>;
    delete: (path: string, params?: any, options?: any) => Promise<any>;
  };
  
  env: {
    isElectron: boolean;
    apiUrl: string | null;
  };
  
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => (() => void);
  };
  
  // ショートカット
  shortcuts?: {
    onRefreshData: (callback: () => void) => (() => void);
    onSelectFile: (callback: () => void) => (() => void);
  };
  
  // ロガー機能を追加
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  }
}

// グローバルウィンドウオブジェクトの拡張
declare global {
  interface Window {
    electron?: ElectronAPI;
    currentApiPort?: number;
    apiInitialized?: boolean;
    electronReady?: boolean;
    electronInitTime?: number;
    performance: Performance;
    // システム健全性情報を追加
    systemHealth?: {
      status: string;
      progress: number;
      lastChecked: number;
      components?: Record<string, boolean>;
    };
  }
}

export {};