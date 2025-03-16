'use client';

import React, { useState } from 'react';
import { getDefaultPath, selectFile } from '@/app/lib/api';
import { useNotification } from '@/app/contexts/NotificationContext';

interface FileSelectorProps {
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}

const FileSelector: React.FC<FileSelectorProps> = ({ onSelectFile, selectedFilePath }) => {
  const { addNotification } = useNotification();
  const [isSelectingFile, setIsSelectingFile] = useState(false);

  const handleSelectFile = async () => {
    setIsSelectingFile(true);
    try {
      // デスクトップアプリケーション環境でファイル選択ダイアログを表示
      const response = await selectFile(selectedFilePath || undefined);
      
      if (response.success && response.path) {
        onSelectFile(response.path);
        addNotification(`ファイルを選択しました: ${response.path}`, 'success');
      } else {
        // ファイル選択がキャンセルされた場合やエラーが発生した場合
        if (response.message) {
          addNotification(response.message, 'error');
        }
      }
    } catch (error) {
      addNotification('ファイルの選択中にエラーが発生しました', 'error');
      console.error('ファイル選択エラー:', error);
    } finally {
      setIsSelectingFile(false);
    }
  };

  return (
    <div className="flex items-center">
      {/* 現在選択されているファイルの表示 */}
      {selectedFilePath && (
        <div className="text-text-secondary text-xs mr-2 max-w-xs truncate">
          現在のファイル: {selectedFilePath}
        </div>
      )}
      
      {/* ファイル選択ボタン */}
      <button
        onClick={handleSelectFile}
        disabled={isSelectingFile}
        className="bg-transparent text-text-accent px-2.5 py-1.5 rounded border border-text-accent text-xs mr-2 hover:bg-text-accent hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSelectingFile ? '選択中...' : '参照'}
      </button>
    </div>
  );
};

export default FileSelector;