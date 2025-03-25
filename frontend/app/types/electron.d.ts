// Electronの型定義
interface ElectronAPI {
  // Electron識別フラグ
  isElectron: boolean;
  
  getAppPath: () => Promise<string>;
  getApiBaseUrl: () => Promise<string>;
  getTempPath: () => Promise<string>;
  env: {
    isElectron: boolean;
    apiUrl: string;
  };
  fs: {
    readFile: (filePath: string, options?: any) => Promise<any>;
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
  dialog?: {
    openCSVFile: (defaultPath?: string) => Promise<{
      success: boolean;
      message: string;
      path: string | null;
    }>;
  };
  
  // API通信ブリッジ - 追加
  api: {
    request: (method: string, path: string, params?: any, data?: any, options?: any) => Promise<any>;
    get: (path: string, params?: any, options?: any) => Promise<any>;
    post: (path: string, data?: any, params?: any, options?: any) => Promise<any>;
    put: (path: string, data?: any, params?: any, options?: any) => Promise<any>;
    delete: (path: string, params?: any, options?: any) => Promise<any>;
  };
  
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => (() => void);
  };
}

// グローバルwindowオブジェクトの拡張
declare global {
  interface Window {
    electron?: ElectronAPI;
    currentApiPort?: number;
    apiInitialized?: boolean;
    electronReady?: boolean;
    electronInitTime?: number;
  }
}

export {};