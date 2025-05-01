import React, { useState, useEffect } from 'react';
import FileSelector from '../components/FileSelector';
import Header from '../components/Header';
import MilestoneTimeline from '../components/MilestoneTimeline';
import ErrorMessage from '../components/ErrorMessage';
import { useApi } from '../contexts/ApiContext';
import { useNotification } from '../contexts/NotificationContext';

const MilestoneDashboard: React.FC = () => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const { status: apiStatus, checkConnection } = useApi();
  const { addNotification } = useNotification();
  const [isInitializing, setIsInitializing] = useState(true);

  // 初回マウント時にデフォルトファイルパスを取得
  useEffect(() => {
    // マウント状態を追跡
    let isMounted = true;
    
    // 前回のパスを復元（ローカルストレージ）
    const loadStoredPath = () => {
      if (typeof window === 'undefined') return null;
      
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
    
    const initializePage = async () => {
      try {
        // ローカルストレージから前回のパスをロード
        const storedPath = loadStoredPath();
        
        if (!isMounted) return;
        
        // ストレージからパスが見つかった場合はすぐに設定
        if (storedPath) {
          setSelectedFilePath(storedPath);
        }
        
        // 初期化完了
        setIsInitializing(false);
      } catch (error) {
        console.error(`ページ初期化エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };
    
    // 初期化実行
    initializePage();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // API状態更新のハンドラー
  const handleApiStatusRetry = async () => {
    try {
      addNotification('バックエンドサーバーへの再接続を試みています...', 'info');
      const result = await checkConnection();
      
      if (result) {
        addNotification('バックエンドサーバーへの接続が確立されました', 'success');
      } else {
        addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
      }
    } catch (error) {
      console.error(`API再接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      addNotification('バックエンドサーバーへの再接続に失敗しました', 'error');
    }
  };

  // ファイル選択ハンドラー
  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
    
    // パスを保存
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('lastSelectedPath', path);
      } catch (e) {
        console.log('LocalStorageへの保存エラー');
      }
    }
  };

  // データ更新ハンドラー
  const handleRefreshData = () => {
    // マイルストーンタイムラインは内部でデータを再取得するためここでは何もしない
    // 将来的に必要があれば、再レンダリングをトリガーするstateを更新する
    addNotification('データを更新しています...', 'info');
  };

  return (
    <main className="min-h-screen bg-background">
      <Header
        updateTime="マイルストーンタイムライン" 
        onRefresh={handleRefreshData}
        selectedFilePath={selectedFilePath}
        onSelectFile={handleSelectFile}
      />
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* API接続エラー通知 */}
        {!apiStatus.connected && (
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
        
        {/* 初期化中の表示 */}
        {isInitializing && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-gray-400 mb-2"></div>
              <div className="text-text-secondary">ロード中...</div>
            </div>
          </div>
        )}
        
        {/* マイルストーンタイムライン */}
        {!isInitializing && apiStatus.connected && (
          <MilestoneTimeline filePath={selectedFilePath || undefined} onRefresh={handleRefreshData} />
        )}
        
        {/* ファイルが選択されていない場合の表示 */}
        {!isInitializing && apiStatus.connected && !selectedFilePath && (
          <div className="flex flex-col items-center justify-center h-64 bg-surface rounded-lg p-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-text-secondary mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-text-primary mb-2">データファイルを選択してください</h3>
            <p className="text-text-secondary text-center mb-4">マイルストーンデータを表示するには、まず上部のメニューからファイルを選択してください。</p>
            <div className="flex justify-center">
              <FileSelector 
                onSelectFile={handleSelectFile} 
                selectedFilePath={selectedFilePath}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default MilestoneDashboard;