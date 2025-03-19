// Electronの型定義
interface ElectronAPI {
    getAppPath: () => Promise<string>;
    getApiBaseUrl: () => Promise<string>; // 追加: APIベースURL取得
    env: {
      isElectron: boolean;
      apiUrl: string;
    };
    fs: {
      readFile: (filePath: string, options?: any) => Promise<any>;
      writeFile: (filePath: string, data: any, options?: any) => Promise<void>;
      mkdir: (dirPath: string, options?: any) => Promise<void>;
      exists: (path: string) => boolean;
      readdir: (dirPath: string, options?: any) => Promise<string[]>;
    };
    path: {
      join: (...args: string[]) => string;
      dirname: (filePath: string) => string;
      basename: (filePath: string) => string;
    };
    dialog?: {
      openCSVFile: (defaultPath?: string) => Promise<{
        success: boolean;
        message: string;
        path: string | null;
      }>;
    };
  }
  
  // グローバルwindowオブジェクトの拡張
  declare global {
    interface Window {
      electron?: ElectronAPI;
      currentApiPort?: number; // 追加: 現在のAPIポート
    }
  }
  
  export {};