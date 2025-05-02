import React, { useState, useEffect, lazy, useCallback } from 'react';
import { useProjects } from '../hooks/useProjects';
import { getDefaultPath } from '../services/api';
import { useNotification } from '../contexts/NotificationContext';
import { useApi } from '../contexts/ApiContext';
import { LazyLoadWrapper } from '../components/LazyLoadWrapper';

// 遅延ロードするコンポーネント
const Header = lazy(() => import('../components/Header'));
const MetricsCards = lazy(() => import('../components/MetricsCards'));
const ProjectTable = lazy(() => import('../components/ProjectTable'));
const ErrorMessage = lazy(() => import('../components/ErrorMessage'));

// 最小限のローディングコンポーネントは即時ロード
const LoadingPlaceholder = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-16 bg-surface rounded"></div>
    <div className="h-24 bg-surface rounded"></div>
    <div className="h-64 bg-surface rounded"></div>
  </div>
);

// クライアントサイドかどうかをチェック
const isClient = typeof window !== 'undefined';

const Dashboard: React.FC = () => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<{message: string, details?: any} | null>(null);
  const { addNotification } = useNotification();
  
  // APIコンテキストから状態を取得
  const { status: apiStatus, checkConnection } = useApi();

  // カスタムフックからプロジェクト状態と関数を取得
  const { 
    projects, 
    metrics, 
    isLoading, 
    error, 
    refreshData,
    openFile: handleOpenFile 
  } = useProjects(selectedFilePath);

  // 初回マウント時にデフォルトファイルパスを取得
  useEffect(() => {
    // マウント状態を追跡
    let isMounted = true;
    
    // 前回のパスを復元（ローカルストレージ）
    const loadStoredPath = () => {
      if (!isClient) return null;
      
      try {
        const savedPath = localStorage.getItem('lastSelectedPath');
        if (savedPath) {
          console.log(`前回のファイルパスをロード: ${savedPath}`);
          return savedPath;
        }
      } catch (e) {
        console.log('LocalStorageからの読み込みエラー');
      }
      return null;
    };
    
    // 並列初期化処理
    const initializeApp = async () => {
      try {
        // ローカルストレージと非同期操作を並列実行
        const [storedPath, connectionResult] = await Promise.all([
          // ローカルストレージから前回のパスをロード - 同期なのでPromiseでラップ
          Promise.resolve(loadStoredPath()),
          
          // API接続が確立されていない場合の確認処理
          (!apiStatus.connected && !apiStatus.loading) ? checkConnection() : Promise.resolve(apiStatus.connected)
        ]);
        
        if (!isMounted) return;
        
        // ストレージからパスが見つかった場合はすぐに設定
        if (storedPath) {
          setSelectedFilePath(storedPath);
        }
        
        // 接続状態に応じたエラー処理
        if (!connectionResult) {
          console.log('バックエンドサーバーに接続できません');
          
          if (initError === null) {
            setInitError({
              message: 'バックエンドサーバーに接続できません。',
              details: {
                reason: '別のアプリケーションがAPIポートを使用している可能性があります。',
                solution: 'アプリケーションを再起動するか、使用中のアプリケーションを終了してから再試行してください。'
              }
            });
            
            addNotification('バックエンドサーバーに接続できません。', 'error');
          }
        } else {
          // 接続成功時はエラーをクリア
          setInitError(null);
          
          // ストレージからパスが見つからなかった場合のみAPIからデフォルトパスを取得
          if (!storedPath && apiStatus.connected) {
            try {
              const response = await getDefaultPath();
              if (response.success && response.path && isMounted) {
                setSelectedFilePath(response.path);
                
                // パスを保存
                if (isClient) {
                  try {
                    localStorage.setItem('lastSelectedPath', response.path);
                  } catch (e) {
                    console.log('LocalStorageへの保存エラー');
                  }
                }
                
                addNotification('デフォルトファイルを読み込みました', 'success');
              } else {
                console.log('デフォルトファイルパスが取得できませんでした');
              }
            } catch (e) {
              console.log('デフォルトファイルパス取得エラー');
            }
          }
        }
      } catch (error: any) {
        console.error(`アプリケーション初期化エラー: ${error.message}`);
        
        if (isMounted) {
          setInitError({
            message: 'アプリケーションの初期化中にエラーが発生しました。APIサーバーに接続できません。',
            details: error
          });
          
          addNotification('APIサーバーに接続できません。', 'error');
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };
    
    // 初期化実行 - 非同期で
    initializeApp();
    
    return () => {
      isMounted = false;
    };
  }, [addNotification, apiStatus.connected, apiStatus.loading, checkConnection, initError]);

  // API状態更新のハンドラー
  const handleApiStatusRetry = useCallback(async () => {
    try {
      addNotification('バックエンドサーバーへの再接続を試みています...', 'info');
      const result = await checkConnection();
      
      if (result) {
        addNotification('バックエンドサーバーへの接続が確立されました', 'success');
        // 接続成功時にデータを再読み込み
        refreshData();
      } else {
        addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
      }
    } catch (error) {
      console.error(`API再接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
    }
  }, [addNotification, checkConnection, refreshData]);

  // ファイル選択ハンドラー
  const handleSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    
    // パスを保存
    if (isClient) {
      try {
        localStorage.setItem('lastSelectedPath', path);
      } catch (e) {
        console.log('LocalStorageへの保存エラー');
      }
    }
  }, []);

  // キーボードショートカットリスナー
  useEffect(() => {
    if (!isClient || !window.electron?.shortcuts) return;

    // Ctrl+O/Cmd+Oでファイル選択
    const removeSelectListener = window.electron.shortcuts.onSelectFile(async () => {
      try {
        const { selectFile } = await import('../services/api');
        const response = await selectFile(selectedFilePath || undefined);
        if (response.success && response.path) {
          handleSelectFile(response.path);
          addNotification('ファイルを選択しました', 'success');
        }
      } catch (error: any) {
        addNotification(`ファイル選択エラー: ${error.message}`, 'error');
      }
    });

    return () => {
      if (removeSelectListener) removeSelectListener();
    };
  }, [addNotification, handleSelectFile, selectedFilePath]);

  return (
    <main className="min-h-screen bg-background">
      <LazyLoadWrapper>
        <Header 
          updateTime={metrics?.last_updated || '更新情報がありません'} 
          onRefresh={refreshData}
          selectedFilePath={selectedFilePath}
          onSelectFile={handleSelectFile}
        />
      </LazyLoadWrapper>
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* API接続状態通知 */}
        {apiStatus.loading ? (
          <div className="mb-4 p-3 rounded bg-blue-900 bg-opacity-30">
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div>
                <p className="font-medium text-white">バックエンド接続中</p>
                <p className="text-sm text-gray-300">
                  {apiStatus.message || 'バックエンドサーバーに接続しています...'}
                </p>
              </div>
            </div>
          </div>
        ) : !apiStatus.connected && (
          <div className="mb-4 p-3 rounded bg-red-900 bg-opacity-30">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium text-white">API接続エラー</p>
                  <p className="text-sm text-gray-300">
                    バックエンドサーバーに接続できません
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleApiStatusRetry}
                className="bg-white text-gray-800 px-3 py-1 rounded text-sm transition-colors hover:bg-gray-200"
              >
                再接続
              </button>
            </div>
          </div>
        )}
        
        {/* 初期化エラー表示 */}
        {!isInitializing && initError && (
          <LazyLoadWrapper>
            <ErrorMessage 
              message={initError.message} 
              details={initError.details}
              onRetry={handleApiStatusRetry}
            />
          </LazyLoadWrapper>
        )}
        
        {/* データ取得エラー表示 */}
        {error && (
          <LazyLoadWrapper>
            <ErrorMessage 
              message={error.message} 
              details={error.details} 
              onRetry={refreshData}
            />
          </LazyLoadWrapper>
        )}
        
        {/* メトリクスカード表示 */}
        {metrics && metrics.summary && (
          <LazyLoadWrapper>
            <MetricsCards 
              summary={metrics.summary} 
              isLoading={isLoading} 
            />
          </LazyLoadWrapper>
        )}
        
        {/* プロジェクト一覧表示 */}
        <LazyLoadWrapper>
          <ProjectTable 
            projects={projects || []} 
            isLoading={isLoading}
            onOpenFile={handleOpenFile}
            filePath={selectedFilePath || undefined}
          />
        </LazyLoadWrapper>
      </div>
    </main>
  );
};

export default Dashboard;