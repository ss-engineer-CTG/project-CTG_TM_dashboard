'use client';

import React from 'react';

interface APIConnectionStatus {
  connected: boolean;
  loading: boolean;
  message: string;
  lastChecked: Date | null;
  details?: any;
}

interface APIStatusProps {
  status: APIConnectionStatus;
  onRetry: () => void;
}

const APIStatus: React.FC<APIStatusProps> = ({ status, onRetry }) => {
  if (status.connected && !status.loading) {
    // 接続が確立されている場合は小さなインジケーターのみ表示
    return (
      <div className="mb-4 flex items-center text-xs text-green-500">
        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
        APIサーバーに接続中
      </div>
    );
  }
  
  return (
    <div className={`mb-4 p-3 rounded ${status.loading ? 'bg-gray-700' : 'bg-red-900 bg-opacity-30'}`}>
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
          </div>
        </div>
        
        {!status.loading && (
          <button
            onClick={onRetry}
            className="bg-white text-gray-800 px-3 py-1 rounded text-sm hover:bg-gray-200 transition-colors"
          >
            再接続
          </button>
        )}
      </div>
      
      {!status.loading && (
        <div className="mt-2 text-xs text-gray-400">
          <p>考えられる原因:</p>
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>バックエンドサーバーが起動していない</li>
            <li>別のポートで実行されている</li>
            <li>ファイアウォールがブロックしている</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default APIStatus;