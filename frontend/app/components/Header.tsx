'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { getDefaultPath } from '@/app/lib/api';
import { useNotification } from '@/app/contexts/NotificationContext';

interface HeaderProps {
  updateTime: string;
  onRefresh: () => void;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  updateTime, 
  onRefresh, 
  selectedFilePath, 
  onSelectFile 
}) => {
  const pathname = usePathname();
  const { addNotification } = useNotification();
  const [isSelectingFile, setIsSelectingFile] = useState(false);

  // ファイル選択ハンドラー
  // Note: 実際のWeb環境ではFileSystemAccessAPIかElectron/Tauriなどを使用します
  const handleSelectFile = async () => {
    setIsSelectingFile(true);
    try {
      // 実環境ではファイル選択ダイアログを表示しますが
      // ここではデフォルトパスを取得するAPIを呼び出します
      const response = await getDefaultPath();
      if (response.success && response.path) {
        onSelectFile(response.path);
        addNotification(`ファイルを選択しました: ${response.path}`, 'success');
      } else {
        addNotification(response.message || 'ファイルの選択に失敗しました', 'error');
      }
    } catch (error) {
      addNotification('ファイルの選択中にエラーが発生しました', 'error');
    } finally {
      setIsSelectingFile(false);
    }
  };

  return (
    <header className="bg-surface border-b border-opacity-10 border-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">プロジェクト進捗ダッシュボード</h1>
          <p className="text-text-secondary text-sm">{updateTime}</p>
        </div>
        
        <div className="flex items-center">
          {/* ファイル表示 */}
          {selectedFilePath && (
            <div className="text-text-secondary text-xs mr-2 max-w-xs truncate">
              現在のファイル: {selectedFilePath}
            </div>
          )}
          
          {/* ボタングループ */}
          <div className="flex">
            <button
              onClick={handleSelectFile}
              disabled={isSelectingFile}
              className="bg-transparent text-text-accent px-2.5 py-1.5 rounded border border-text-accent text-xs mr-2 hover:bg-text-accent hover:text-surface transition-colors"
            >
              参照
            </button>
            <button
              onClick={onRefresh}
              className="bg-text-accent text-surface px-2.5 py-1.5 rounded text-xs hover:bg-opacity-80 transition-colors"
            >
              更新
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;