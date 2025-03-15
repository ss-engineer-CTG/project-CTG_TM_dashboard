'use client';

import React, { useRef } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { FiRefreshCw, FiFolder } from 'react-icons/fi';

export default function Header() {
  const { 
    selectedFilePath, 
    setSelectedFilePath, 
    refreshData, 
    dashboardData,
    showNotification
  } = useDashboard();
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル選択ハンドラー
  const handleFileSelect = () => {
    // ファイル選択ダイアログを開く代わりにバックエンドAPIを呼び出す
    // この実装はフロントエンドからバックエンドのファイル選択ダイアログを開く
    if (window && window.showOpenFilePicker) {
      // Modern File System Access API (一部のブラウザのみサポート)
      openFilePicker();
    } else {
      // 従来のファイル選択
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  // Modern File System Access API
  const openFilePicker = async () => {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'CSV Files',
            accept: {
              'text/csv': ['.csv'],
            },
          },
        ],
      });
      const file = await fileHandle.getFile();
      // ファイルパスは直接取得できないため、ファイル自体をバックエンドにアップロードする必要がある
      // ここでは省略し、代わりにファイル名を表示
      showNotification(`ファイル選択: ${file.name}`, 'success');
    } catch (error) {
      console.error('ファイル選択キャンセル', error);
    }
  };

  // ファイル選択変更ハンドラー
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // 実際のアプリケーションではここでファイルをサーバーにアップロードする
      // このサンプルでは単純にパスを更新
      const filePath = files[0].name;
      setSelectedFilePath(filePath);
      refreshData();
    }
  };

  // データ更新ハンドラー
  const handleRefresh = () => {
    refreshData();
    showNotification('データを更新しました', 'success');
  };

  // 現在のファイル名のみを表示する関数
  const getDisplayFileName = (path: string) => {
    if (!path) return '';
    // パスの最後の部分（ファイル名）のみを表示
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  return (
    <header className="bg-dark-surface border-b border-gray-700 shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-light-primary">プロジェクト進捗ダッシュボード</h1>
          <p className="text-light-secondary text-sm mt-1">
            {dashboardData.summary?.update_time && `最終更新: ${dashboardData.summary.update_time}`}
          </p>
        </div>
        
        <div className="flex items-center mt-4 md:mt-0">
          {/* ファイル表示 */}
          <div className="text-light-secondary text-sm mr-3 max-w-[200px] overflow-hidden overflow-ellipsis whitespace-nowrap">
            {selectedFilePath ? getDisplayFileName(selectedFilePath) : 'ファイルが選択されていません'}
          </div>
          
          {/* ファイル選択用の非表示input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleFileChange}
          />
          
          {/* ファイル選択ボタン */}
          <button 
            onClick={handleFileSelect}
            className="btn-outline mr-2 flex items-center text-sm"
          >
            <FiFolder className="mr-1" />
            参照
          </button>
          
          {/* データ更新ボタン */}
          <button 
            onClick={handleRefresh}
            className="btn-primary flex items-center text-sm"
          >
            <FiRefreshCw className="mr-1" />
            更新
          </button>
        </div>
      </div>
    </header>
  );
}