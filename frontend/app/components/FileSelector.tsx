'use client';

import React, { useState, useEffect } from 'react';
import { selectFile } from '@/app/lib/services';
import { useNotification } from '@/app/contexts/NotificationContext';
import { isElectronEnvironment } from '@/app/lib/utils/environment';

interface FileSelectorProps {
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}

const FileSelector: React.FC<FileSelectorProps> = ({ onSelectFile, selectedFilePath }) => {
  const { addNotification } = useNotification();
  const [isSelectingFile, setIsSelectingFile] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  // Electron環境を検出して状態を更新
  useEffect(() => {
    const electronCheck = isElectronEnvironment();
    setIsElectron(electronCheck);
    console.log('FileSelector: Electron環境の検出結果:', electronCheck, {
      windowElectron: window.electron ? '存在します' : '存在しません',
      windowElectronDialog: window.electron?.dialog ? '存在します' : '存在しません'
    });
  }, []);

  // ファイル参照ボタン処理
  const handleSelectFile = async () => {
    console.log('FileSelector: handleSelectFile が呼び出されました');
    setIsSelectingFile(true);
    
    try {
      console.log('FileSelector: selectFile を呼び出します...');
      const response = await selectFile(selectedFilePath || undefined);
      console.log('FileSelector: selectFile の結果:', response);
      
      if (response.success && response.path) {
        console.log('FileSelector: ファイル選択成功:', response.path);
        onSelectFile(response.path);
        addNotification(`ファイルを選択しました: ${response.path}`, 'success');
      } else {
        console.log('FileSelector: ファイル選択失敗または中断:', response.message);
        if (response.message) {
          addNotification(response.message, 'error');
        }
      }
    } catch (error: any) {
      console.error('FileSelector: ファイル選択エラー:', error);
      addNotification('ファイルの選択中にエラーが発生しました', 'error');
    } finally {
      console.log('FileSelector: handleSelectFile 完了');
      setIsSelectingFile(false);
    }
  };

  return (
    <div className="flex items-center flex-wrap">
      {/* 現在選択されているファイルの表示 */}
      {selectedFilePath && (
        <div className="text-text-secondary text-xs mr-2 max-w-xs truncate mb-2">
          現在のファイル: {selectedFilePath}
        </div>
      )}
      
      <div className="flex gap-2">
        {/* メイン参照ボタン - 幅広くして視認性向上 */}
        <button
          onClick={handleSelectFile}
          disabled={isSelectingFile}
          className="bg-transparent text-text-accent px-4 py-2 rounded border border-text-accent text-sm hover:bg-text-accent hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-32"
          data-testid="file-select-button"
        >
          {isSelectingFile ? '選択中...' : 'ファイルを選択'}
        </button>
      </div>
    </div>
  );
};

export default FileSelector;