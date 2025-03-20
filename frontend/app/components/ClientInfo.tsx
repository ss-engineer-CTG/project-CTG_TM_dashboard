'use client';

import React, { useState, useEffect } from 'react';
import { isElectronEnvironment } from '../lib/utils/environment';

/**
 * クライアント側でのみ実行される情報表示コンポーネント
 * SSRとCSRの不一致によるハイドレーションエラーを防ぐ
 */
const ClientInfo: React.FC = () => {
  const [electronInfo, setElectronInfo] = useState({
    isElectron: false,
    apiPort: undefined as number | undefined,
    apiBaseUrl: '',
    electronProps: [] as string[]
  });
  
  // マウント後にクライアント環境情報を取得
  useEffect(() => {
    const isElectron = isElectronEnvironment();
    
    setElectronInfo({
      isElectron,
      apiPort: window.currentApiPort,
      apiBaseUrl: window.electron?.env?.apiUrl || '',
      electronProps: isElectron ? Object.keys(window.electron || {}) : []
    });
  }, []);

  // 開発環境でのみ表示するデバッグ情報
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="mt-8 p-4 bg-gray-800 rounded">
      <h3 className="text-yellow-400 text-sm font-medium mb-2">クライアント環境情報</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-400">
        <div>
          <p><span className="text-gray-300">環境: </span>{process.env.NODE_ENV}</p>
          <p><span className="text-gray-300">Electron環境: </span>
             {electronInfo.isElectron ? 'はい' : 'いいえ'}</p>
          <p><span className="text-gray-300">API ポート: </span>
             {electronInfo.apiPort || 'なし'}</p>
          <p><span className="text-gray-300">API Base URL: </span>
             {electronInfo.apiBaseUrl || 'なし'}</p>
        </div>
        {electronInfo.isElectron && (
          <div>
            <p className="text-gray-300">Electron API:</p>
            <ul className="list-disc list-inside ml-2">
              {electronInfo.electronProps.map(prop => (
                <li key={prop}>{prop}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientInfo;