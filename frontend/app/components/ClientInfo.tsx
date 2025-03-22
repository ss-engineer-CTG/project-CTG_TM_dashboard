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
  
  const [retryCount, setRetryCount] = useState(0);
  
  // マウント後にクライアント環境情報を取得（遅延検出ロジック追加）
  useEffect(() => {
    // 即時実行の初期チェック
    checkElectronEnvironment();
    
    // 念のため少し遅延させて再チェック（タイミング問題対策）
    const delayedCheck = setTimeout(() => {
      if (!electronInfo.isElectron && retryCount < 3) {
        console.log(`Electron環境検出: 再試行 ${retryCount + 1}/3`);
        checkElectronEnvironment();
        setRetryCount(prev => prev + 1);
      }
    }, 1000); // 1秒後に再チェック
    
    return () => clearTimeout(delayedCheck);
  }, [retryCount]);
  
  // Electron環境検出ロジック
  const checkElectronEnvironment = () => {
    const isElectron = isElectronEnvironment();
    console.log('ClientInfo: Electron環境検出結果:', isElectron);
    
    if (isElectron || window.electron) {
      // Electron環境が検出された場合
      setElectronInfo({
        isElectron: true,
        apiPort: window.currentApiPort,
        apiBaseUrl: window.electron?.env?.apiUrl || '',
        electronProps: Object.keys(window.electron || {})
      });
    } else {
      // 検出されなかった場合でも情報を更新
      setElectronInfo({
        isElectron: false,
        apiPort: window.currentApiPort,
        apiBaseUrl: '',
        electronProps: []
      });
    }
  };

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