'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { getDefaultPath } from '@/app/lib/services';
import { useNotification } from '@/app/contexts/NotificationContext';
import FileSelector from './FileSelector';

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
  const handleSelectFile = (path: string) => {
    console.log('Header: handleSelectFile が呼び出されました', { path });
    onSelectFile(path);
  };

  return (
    <header className="bg-surface border-b border-opacity-10 border-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">プロジェクト進捗ダッシュボード</h1>
          <p className="text-text-secondary text-sm">{updateTime}</p>
        </div>
        
        <div className="flex items-center">
          <FileSelector 
            onSelectFile={handleSelectFile} 
            selectedFilePath={selectedFilePath}
          />
          
          <button
            onClick={onRefresh}
            className="bg-text-accent text-surface px-2.5 py-1.5 rounded text-xs hover:bg-opacity-80 transition-colors ml-2"
          >
            更新
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;