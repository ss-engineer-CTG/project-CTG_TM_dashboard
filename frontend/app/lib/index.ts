// APIモジュールのエントリーポイント
// 各サブモジュールからのエクスポートを再エクスポート

export * from './client';
export * from './connection';
export * from './services';

// 衝突する関数は明示的に名前を変えてインポート/エクスポート
import { 
  initializeApi,
  testApiConnection as testApiConnectionInit, 
  detectApiPort as detectApiPortInit,
  rediscoverApiPort as rediscoverApiPortInit
} from './api-init';

export { 
  initializeApi
};