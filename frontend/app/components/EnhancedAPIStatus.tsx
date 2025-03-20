'use client';

import React, { useState, useEffect } from 'react';
import { APIConnectionStatus } from '@/app/lib/types';
import { useApi } from '@/app/contexts/ApiContext';
import { isClient } from '@/app/lib/utils/environment';

interface EnhancedAPIStatusProps {
  onRetry: () => void;
}

const EnhancedAPIStatus: React.FC<EnhancedAPIStatusProps> = ({ onRetry }) => {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  // APIコンテキストから状態を取得
  const { status, reconnectAttempts, checkConnection } = useApi();
  
  // 自動再接続のカウントダウン - クライアントサイドでのみ実行
  useEffect(() => {
    // サーバーサイドレンダリング時は何もしない
    if (!isClient) return;

    // コンポーネントのマウント状態を追跡するフラグ
    let isMounted = true;
    
    if (status.connected || !status.message.includes('接続できません')) {
      return;
    }
    
    // 初めての数回の失敗では自動再接続を試みる
    if (reconnectAttempts < 3) {
      const autoRetryTime = 15 - (reconnectAttempts * 5);
      setCountdown(autoRetryTime);
      
      const timer = setInterval(() => {
        if (!isMounted) return;
        
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleRetry();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => {
        clearInterval(timer);
        isMounted = false;
      };
    }
    
    return () => {
      isMounted = false;
    };
  }, [status.connected, status.message, reconnectAttempts]);
  
  // 再接続ハンドラー
  const handleRetry = async () => {
    if (isReconnecting) return;
    
    setIsReconnecting(true);
    try {
      await checkConnection();
      onRetry();
    } finally {
      setIsReconnecting(false);
    }
  };
  
  // 接続済みの場合は簡略表示
  if (status.connected && !status.loading) {
    return (
      <div className="mb-4 flex items-center text-xs text-green-500">
        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
        APIサーバーに接続中
      </div>
    );
  }
  
  // 初期ロード中の場合
  if (status.loading && reconnectAttempts === 0) {
    return (
      <div className="mb-4 p-3 rounded bg-gray-700">
        <div className="flex items-center">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mr-3"></div>
          <div>
            <p className="font-medium text-white">バックエンドサーバーに接続中...</p>
            <p className="text-sm text-gray-300">サーバーの起動を待っています。しばらくお待ちください。</p>
          </div>
        </div>
      </div>
    );
  }
  
  // エラー時の詳細なヘルプ表示
  const renderDetailedHelp = () => {
    if (!status.connected && !status.loading && reconnectAttempts > 1) {
      return (
        <div className="mt-4 p-3 bg-gray-800 rounded-md">
          <h4 className="text-yellow-400 text-sm font-medium mb-2">トラブルシューティング:</h4>
          <ol className="list-decimal list-inside text-gray-300 space-y-1 text-sm">
            <li>アプリケーションを<strong>完全に終了</strong>して再起動してください</li>
            <li>タスクマネージャーでPython関連プロセスを確認し、終了してください</li>
            <li>ポート8000、8080が他のアプリで使用されていないか確認してください</li>
            <li>管理者権限でアプリケーションを実行してみてください</li>
          </ol>
        </div>
      );
    }
    return null;
  };
  
  // エラー時の拡張表示
  return (
    <div className="mb-4 p-3 rounded bg-red-900 bg-opacity-30">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {status.loading ? (
            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mr-3"></div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500 mr-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          <div>
            <p className="font-medium text-white">{status.loading ? 'API接続確認中...' : 'API接続エラー'}</p>
            <p className="text-sm text-gray-300">{status.message}</p>
            
            {/* カウントダウン表示 */}
            {countdown > 0 && (
              <p className="text-xs text-blue-300 mt-1">
                {countdown}秒後に自動的に再接続します...
              </p>
            )}
          </div>
        </div>
        
        {!status.loading && (
          <button
            onClick={handleRetry}
            disabled={isReconnecting}
            className={`bg-white text-gray-800 px-3 py-1 rounded text-sm transition-colors ${
              isReconnecting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'
            }`}
          >
            {isReconnecting ? '再接続中...' : '再接続'}
          </button>
        )}
      </div>
      
      {!status.loading && (
        <div className="mt-2 text-xs text-gray-400">
          <p>考えられる原因:</p>
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>バックエンドサーバーが起動中です - しばらくお待ちください</li>
            <li>バックエンドサーバーが別のポートで実行されています</li>
            <li>ファイアウォールがブロックしています</li>
            <li>サーバープロセスが終了した可能性があります</li>
          </ul>
          
          {reconnectAttempts >= 3 && (
            <div className="mt-2 p-2 border border-yellow-600 rounded text-yellow-300">
              <p className="font-medium">自動再接続に複数回失敗しました。</p>
              <p className="mt-1">アプリケーションを再起動するか、ポート設定を確認してください。</p>
              <p className="mt-1">接続試行回数: {reconnectAttempts}</p>
            </div>
          )}
          
          {/* 詳細なヘルプ表示 */}
          {renderDetailedHelp()}
        </div>
      )}
    </div>
  );
};

export default EnhancedAPIStatus;