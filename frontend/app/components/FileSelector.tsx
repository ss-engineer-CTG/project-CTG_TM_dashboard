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

  // 手動入力処理
  const handleManualInput = () => {
    console.log('FileSelector: handleManualInput が呼び出されました');
    const path = prompt("CSVファイルの完全パスを入力してください:", selectedFilePath || "");
    if (path) {
      onSelectFile(path);
      addNotification(`ファイルパスを手動で設定しました: ${path}`, 'success');
    }
  };

  // Electronダイアログのテスト用関数
  const testElectronDialog = async () => {
    console.log('FileSelector: testElectronDialog が呼び出されました');
    
    if (isElectronEnvironment() && window.electron?.testDialog) {
      try {
        console.log('FileSelector: Electron testDialog を実行...');
        const result = await window.electron.testDialog();
        console.log('FileSelector: testDialog 結果:', result);
        addNotification('ダイアログテスト: ' + (result.success ? '成功' : '失敗'), result.success ? 'success' : 'error');
      } catch (error) {
        console.error('FileSelector: ダイアログテストエラー:', error);
        addNotification('ダイアログテストエラー', 'error');
      }
    } else {
      console.log('FileSelector: Electron環境が検出されませんでした');
      addNotification('Electron環境が検出されませんでした', 'error');
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
        {/* メイン参照ボタン */}
        <button
          onClick={handleSelectFile}
          disabled={isSelectingFile}
          className="bg-transparent text-text-accent px-2.5 py-1.5 rounded border border-text-accent text-xs hover:bg-text-accent hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="file-select-button"
        >
          {isSelectingFile ? '選択中...' : '参照'} {isElectron ? '(E)' : '(A)'}
        </button>
        
        {/* Electron診断ボタン */}
        <button
          onClick={testElectronDialog}
          className="bg-transparent text-purple-400 px-2.5 py-1.5 rounded border border-purple-400 text-xs hover:bg-purple-400 hover:text-surface transition-colors"
        >
          診断
        </button>
        
        {/* 手動入力ボタン */}
        <button
          onClick={handleManualInput}
          className="bg-transparent text-gray-400 px-2.5 py-1.5 rounded border border-gray-400 text-xs hover:bg-gray-400 hover:text-surface transition-colors"
        >
          パスを入力
        </button>
      </div>
    </div>
  );
};

export default FileSelector;