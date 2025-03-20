'use client';

import React, { useState, useRef } from 'react';
import { selectFile, uploadCSVFile } from '@/app/lib/services';
import { useNotification } from '@/app/contexts/NotificationContext';
import { isElectronEnvironment } from '@/app/lib/utils/environment';

interface FileSelectorProps {
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}

const FileSelector: React.FC<FileSelectorProps> = ({ onSelectFile, selectedFilePath }) => {
  const { addNotification } = useNotification();
  const [isSelectingFile, setIsSelectingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル参照ボタン処理
  const handleSelectFile = async () => {
    setIsSelectingFile(true);
    
    try {
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
    } catch (error: any) {
      console.error('ファイル選択エラー:', error);
      addNotification('ファイルの選択中にエラーが発生しました', 'error');
    } finally {
      setIsSelectingFile(false);
    }
  };

  // ファイルアップロード処理（開発環境用）
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setIsSelectingFile(true);
    
    try {
      const file = files[0];
      // 開発環境の場合はファイルをアップロード
      const response = await uploadCSVFile(file);
      
      if (response.success && response.path) {
        onSelectFile(response.path);
        addNotification(`ファイルをアップロードしました: ${file.name}`, 'success');
      } else {
        addNotification(response.message || 'ファイルのアップロードに失敗しました', 'error');
      }
    } catch (error: any) {
      console.error('ファイルアップロードエラー:', error);
      addNotification('ファイルのアップロード中にエラーが発生しました', 'error');
    } finally {
      // 次回同じファイルを選択できるようにリセット
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsSelectingFile(false);
    }
  };

  // 手動入力処理
  const handleManualInput = () => {
    const path = prompt("CSVファイルの完全パスを入力してください:", selectedFilePath || "");
    if (path) {
      onSelectFile(path);
      addNotification(`ファイルパスを手動で設定しました: ${path}`, 'success');
    }
  };

  // Electronダイアログのテスト用関数
  const testElectronDialog = async () => {
    if (isElectronEnvironment() && window.electron?.testDialog) {
      try {
        const result = await window.electron.testDialog();
        addNotification('ダイアログテスト: ' + (result.success ? '成功' : '失敗'), result.success ? 'success' : 'error');
      } catch (error) {
        console.error('ダイアログテストエラー:', error);
        addNotification('ダイアログテストエラー', 'error');
      }
    } else {
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
        >
          {isSelectingFile ? '選択中...' : '参照'}
        </button>
        
        {/* Electron診断ボタン - 診断モードでのみ表示 */}
        {process.env.NODE_ENV !== 'production' && (
          <button
            onClick={testElectronDialog}
            className="bg-transparent text-purple-400 px-2.5 py-1.5 rounded border border-purple-400 text-xs hover:bg-purple-400 hover:text-surface transition-colors"
          >
            診断
          </button>
        )}
        
        {/* 開発環境用ファイルアップロードボタン */}
        {process.env.NODE_ENV === 'development' && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
              id="csv-file-upload"
            />
            <label
              htmlFor="csv-file-upload"
              className="bg-transparent text-blue-400 px-2.5 py-1.5 rounded border border-blue-400 text-xs hover:bg-blue-400 hover:text-surface transition-colors cursor-pointer"
            >
              アップロード
            </label>
          </>
        )}
        
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