// Electronの型定義
interface ElectronAPI {
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
  testDialog: () => Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }>;
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
  }
}

export {};