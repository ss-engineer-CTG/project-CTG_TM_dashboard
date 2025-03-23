'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/app/contexts/ApiContext'; // 追加: APIコンテキストをインポート

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
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [diagnosticInfo, setDiagnosticInfo] = useState<any>(null);
  
  // 追加: APIコンテキストから状態を取得
  const { status: apiStatus } = useApi();
  
  // 診断情報の収集 - マウント時に一度だけ実行
  useEffect(() => {
    const collectDiagnostics = async () => {
      if (typeof window !== 'undefined' && window.electron?.diagnostics) {
        try {
          const apiStatus = await window.electron.diagnostics.checkApiConnection();
          setDiagnosticInfo({
            apiStatus,
            electronReady: window.electronReady,
            startupTime: window.electron.diagnostics.getStartupTime(),
            isElectron: window.electron.env.isElectron,
            apiInitialized: window.apiInitialized,
            currentApiPort: window.currentApiPort,
            timestamp: Date.now()
          });
        } catch (e) {
          setDiagnosticInfo({
            error: e instanceof Error ? e.message : String(e),
            timestamp: Date.now()
          });
        }
      }
    };
    
    collectDiagnostics();
  }, []);
  
  // 自動再試行のカウントダウンロジック - setState in render 問題を修正
  useEffect(() => {
    // 最初の5回は自動再試行
    if (attempts <= 5) {
      const autoRetryTime = 30 - (attempts * 3); // 回数ごとの待機時間調整
      setCountdown(autoRetryTime);
      
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [attempts]);
  
  // 再試行処理 - 直接レンダー中に状態更新しないように修正
  const handleRetry = useCallback(async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, onRetry]);
  
  // カウントダウンが0になった時の自動再試行
  useEffect(() => {
    if (countdown === 0 && attempts <= 5) {
      handleRetry();
    }
  }, [countdown, attempts, handleRetry]);

  // 追加: APIが接続済みの場合は何も表示しない
  if (apiStatus.connected) {
    return null;
  }

  // ネットワーク状態を安全に取得する関数
  const getNetworkStatus = () => {
    return typeof window !== 'undefined' ? (navigator.onLine ? 'はい' : 'いいえ') : '不明';
  };

  // Pythonプロセスに関するトラブルシューティングガイド
  const renderPythonGuide = () => {
    return (
      <div className="mt-3 bg-gray-800 p-4 rounded-md">
        <h4 className="font-bold text-yellow-300 mb-2">Python環境のトラブルシューティング:</h4>
        <ol className="list-decimal list-inside text-gray-200 space-y-2">
          <li>
            Python環境が正しくインストールされていることを確認:
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-300">
              <li>コマンドプロンプトで「python --version」を実行して確認</li>
              <li>Pythonバージョン 3.8 以上が必要です</li>
            </ul>
          </li>
          <li>
            必要なパッケージがインストールされているか確認:
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-300">
              <li>backend/requirements.txt 内のパッケージをインストール:</li>
              <li className="font-mono bg-gray-900 p-1 mt-1 rounded">pip install -r backend/requirements.txt</li>
              <li>特に重要なのは: pandas, fastapi, uvicorn</li>
            </ul>
          </li>
          <li>
            仮想環境を使用している場合:
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-300">
              <li>仮想環境が有効化されていることを確認</li>
              <li>アプリケーションを仮想環境から起動</li>
            </ul>
          </li>
        </ol>
      </div>
    );
  };

  // ポート競合に関するトラブルシューティングガイド
  const renderPortGuide = () => {
    return (
      <div className="mt-3 bg-gray-800 p-4 rounded-md">
        <h4 className="font-bold text-yellow-300 mb-2">ポート競合のトラブルシューティング:</h4>
        <ol className="list-decimal list-inside text-gray-200 space-y-2">
          <li>
            使用中のポートを確認:
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-300">
              <li>Windows: コマンドプロンプトで「netstat -ano | findstr 8000」を実行</li>
              <li>Mac/Linux: ターミナルで「lsof -i :8000」を実行</li>
              <li>試行されたポート: {ports.join(', ')}</li>
            </ul>
          </li>
          <li>
            競合するプロセスを終了:
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-300">
              <li>Windows: タスクマネージャーでプロセスを終了</li>
              <li>Mac/Linux: 「kill [PID]」でプロセスを終了</li>
              <li>特にPython, node.js関連のプロセスを確認</li>
            </ul>
          </li>
        </ol>
      </div>
    );
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
              <li>必要なPythonパッケージがインストールされていない</li>
              <li>ポートが他のアプリケーションによって使用されている</li>
              <li>ファイアウォールがポートをブロックしている</li>
              <li>セキュリティソフトウェアが接続を妨げている</li>
            </ul>
          </div>
          
          <div className="mb-4">
            <h3 className="font-bold text-green-300 mb-1">解決策:</h3>
            <ul className="list-disc list-inside space-y-1 text-white">
              <li>アプリケーションを完全に終了して再起動する</li>
              <li>タスクマネージャーでPython関連のプロセスを終了する</li>
              <li>backend/requirements.txtのパッケージをインストールする</li>
              <li>ポート8000, 8080を使用している他のアプリケーションを確認して終了する</li>
              <li>管理者権限でアプリケーションを実行する</li>
            </ul>
          </div>
          
          {/* トラブルシューティングガイド */}
          <div className="mt-4">
            <details className="cursor-pointer">
              <summary className="text-blue-300 hover:text-blue-100">詳細なトラブルシューティングガイド</summary>
              <div className="mt-3">
                <div className="flex space-x-2 mb-2">
                  <button
                    onClick={() => setDiagnosticsVisible(!diagnosticsVisible)}
                    className="text-sm bg-blue-800 text-blue-100 px-3 py-1 rounded hover:bg-blue-700"
                  >
                    {diagnosticsVisible ? '診断情報を隠す' : '診断情報を表示'}
                  </button>
                  <button
                    onClick={() => setDetailsVisible(!detailsVisible)}
                    className="text-sm bg-blue-800 text-blue-100 px-3 py-1 rounded hover:bg-blue-700"
                  >
                    {detailsVisible ? '接続情報を隠す' : '接続情報を表示'}
                  </button>
                </div>
                
                {diagnosticsVisible && diagnosticInfo && (
                  <div className="mt-2 bg-gray-800 p-3 rounded-md text-xs font-mono overflow-auto max-h-40">
                    <pre className="text-gray-300">{JSON.stringify(diagnosticInfo, null, 2)}</pre>
                  </div>
                )}
                
                {detailsVisible && (
                  <div className="mt-2 bg-gray-800 p-3 rounded-md text-sm">
                    <p className="text-white font-medium mb-2">接続診断:</p>
                    <p className="text-gray-300">試行されたポート: {ports.join(', ')}</p>
                    <p className="text-gray-300">接続試行回数: {attempts}</p>
                    <p className="text-gray-300">最後のエラー: {lastError || '情報なし'}</p>
                    <p className="text-gray-300 mt-2">ブラウザネットワーク状態:</p>
                    <p className="text-gray-300">オンライン: {getNetworkStatus()}</p>
                  </div>
                )}
                
                {/* Pythonトラブルシューティングガイド */}
                {renderPythonGuide()}
                
                {/* ポート競合トラブルシューティングガイド */}
                {renderPortGuide()}
                
                <div className="mt-3 bg-gray-800 p-4 rounded-md">
                  <h4 className="font-bold text-yellow-300 mb-2">アプリケーションの再起動:</h4>
                  <ol className="list-decimal list-inside text-gray-200 space-y-2">
                    <li>アプリケーションを完全に終了</li>
                    <li>タスクマネージャーですべてのPythonプロセスを終了</li>
                    <li>管理者として再起動 (Windowsでは右クリック→管理者として実行)</li>
                    <li>問題が解決しない場合は、PCを再起動してから再試行</li>
                  </ol>
                </div>
              </div>
            </details>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <p className="text-gray-400 text-sm">
              {attempts <= 5 && countdown > 0
                ? `${countdown}秒後に自動的に再試行します...` 
                : attempts <= 5
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