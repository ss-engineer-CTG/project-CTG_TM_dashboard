import React, { useState } from 'react';
import { HeaderProps } from '../types';
import FileSelector from './FileSelector';

const Header: React.FC<HeaderProps> = ({ 
  updateTime, 
  onRefresh, 
  selectedFilePath, 
  onSelectFile 
}) => {
  // ファイル選択ハンドラー
  const handleSelectFile = (path: string) => {
    console.log('Header: handleSelectFile が呼び出されました', { path });
    onSelectFile(path);
  };

  return (
    <header className="bg-surface border-b border-opacity-10 border-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">プロジェクト進捗ダッシュボード</h1>
          <p className="text-text-secondary text-sm">{updateTime}</p>
        </div>
        
        <div className="flex items-center mt-2 md:mt-0">
          <FileSelector 
            onSelectFile={handleSelectFile} 
            selectedFilePath={selectedFilePath}
          />
          
          <button
            onClick={onRefresh}
            className="bg-text-accent text-surface px-2.5 py-1.5 rounded text-xs hover:bg-opacity-80 transition-colors ml-2"
            aria-label="データを更新"
            title="データを更新"
          >
            更新
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;