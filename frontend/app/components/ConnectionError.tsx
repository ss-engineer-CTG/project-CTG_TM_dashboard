import React, { useState, useEffect } from 'react';

// クライアントサイドのみの処理を判定するヘルパー関数
const isClient = typeof window !== 'undefined';

interface ConnectionErrorProps {
  onRetry: () => void;
  ports: number[];
  attempts: number;
  lastError?: string;
}

const ConnectionError: React.FC<ConnectionErrorProps> = ({ 
  onRetry, 
  ports, 
  attempts,
  lastError
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  // 自動再試行機能 - クライアントサイドでのみ実行
  useEffect(() => {
    // サーバーサイドレンダリング時は何もしない
    if (!isClient) return;

    // 最初の3回は自動再試行
    if (attempts <= 3) {
      const autoRetryTime = 30 - (attempts * 5);
      setCountdown(autoRetryTime);
      
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleRetry();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [attempts]);
  
  const handleRetry = async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  // ネットワーク状態を安全に取得する関数
  const getNetworkStatus = () => {
    return isClient ? (navigator.onLine ? 'はい' : 'いいえ') : '不明';
  };

  return (
    <div className="dashboard-card bg-red-900 bg-opacity-20 p-6">
      <div className="flex items-start">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500 mr-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white mb-2">バックエンドサーバーに接続できません</h2>
          
          <div className="bg-gray-800 p-4 rounded-md mb-4 text-gray-300">
            <p>以下のポートへの接続を試みましたが、成功しませんでした:</p>
            <p className="font-mono mt-2">{ports.join(', ')}</p>
            <p className="mt-2">接続試行回数: {attempts}</p>
            {lastError && (
              <p className="mt-2 text-red-300">エラー: {lastError}</p>
            )}
          </div>
          
          <div className="mb-4">
            <h3 className="font-bold text-yellow-300 mb-1">考えられる原因:</h3>
            <ul className="list-disc list-inside space-y-1 text-white">
              <li>バックエンドサーバーが起動していない</li>
              <li>ポートが他のアプリケーションによって使用されている</li>
              <li>ファイアウォールがブロックしている</li>
              <li>セキュリティソフトウェアが接続を妨げている</li>
            </ul>
          </div>
          
          <div className="mb-4">
            <h3 className="font-bold text-green-300 mb-1">解決策:</h3>
            <ul className="list-disc list-inside space-y-1 text-white">
              <li>アプリケーションを完全に終了して再起動する</li>
              <li>タスクマネージャーを開き、Python関連のプロセスを終了する</li>
              <li>ポート8000, 8080を使用している他のアプリケーションを確認して終了する</li>
              <li>管理者権限でアプリケーションを実行する</li>
            </ul>
          </div>
          
          {/* 診断情報 */}
          <div className="mt-4">
            <button
              onClick={() => setDetailsVisible(!detailsVisible)}
              className="text-blue-300 hover:text-blue-100 underline"
            >
              {detailsVisible ? '診断情報を隠す' : '診断情報を表示'}
            </button>
            
            {detailsVisible && (
              <div className="mt-2 bg-gray-800 p-3 rounded-md text-sm">
                <p className="text-white font-medium mb-2">接続診断:</p>
                <p className="text-gray-300">試行されたポート: {ports.join(', ')}</p>
                <p className="text-gray-300">接続試行回数: {attempts}</p>
                <p className="text-gray-300">最後のエラー: {lastError || '情報なし'}</p>
                <p className="text-gray-300 mt-2">ブラウザネットワーク状態:</p>
                <p className="text-gray-300">オンライン: {getNetworkStatus()}</p>
                <div className="mt-3 text-yellow-300">
                  <p>推奨されるトラブルシューティング:</p>
                  <ol className="list-decimal list-inside ml-2 text-gray-200">
                    <li>アプリケーションを完全に終了し、再起動する</li>
                    <li>タスクマネージャーでpythonプロセスを強制終了する</li>
                    <li>ポートスキャンツールでポート8000, 8080の状態を確認する</li>
                    <li>ファイアウォール設定でアプリケーションを許可する</li>
                    <li>管理者権限でアプリケーションを実行する</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <p className="text-gray-400 text-sm">
              {attempts <= 3 && countdown > 0
                ? `${countdown}秒後に自動的に再試行します...` 
                : attempts <= 3
                  ? '自動再試行を実行中...'
                  : '自動再試行の制限に達しました。手動で再試行してください。'}
            </p>
            
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className={`bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors ${
                isRetrying ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isRetrying ? '接続中...' : '接続を再試行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionError;