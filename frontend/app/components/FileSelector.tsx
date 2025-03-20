'use client';

import React, { useState, useRef } from 'react';
import { selectFile, uploadCSVFile } from '@/app/lib/services';
import { useNotification } from '@/app/contexts/NotificationContext';

interface FileSelectorProps {
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}

const FileSelector: React.FC<FileSelectorProps> = ({ onSelectFile, selectedFilePath }) => {
  const { addNotification } = useNotification();
  const [isSelectingFile, setIsSelectingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 参照ボタン処理
  const handleSelectFile = async () => {
    // 非常に目立つログを追加
    console.log('%c[重要] 参照ボタンがクリックされました!', 'color:red; font-size:16px; font-weight:bold;');
    setIsSelectingFile(true);
    
    try {
      // デスクトップアプリケーション環境でファイル選択ダイアログを表示
      console.log('[デバッグ] 次のパスで selectFile を呼び出します:', selectedFilePath);
      console.log('[デバッグ] APIを使用してファイル選択を開始します');
      
      const response = await selectFile(selectedFilePath || undefined);
      console.log('[FileSelector] selectFile 呼び出し結果:', response);
      
      if (response.success && response.path) {
        console.log('[FileSelector] ファイル選択成功:', response.path);
        onSelectFile(response.path);
        addNotification(`ファイルを選択しました: ${response.path}`, 'success');
      } else {
        // ファイル選択がキャンセルされた場合やエラーが発生した場合
        console.log('[FileSelector] ファイル選択結果 - 失敗または選択なし:', response.message);
        if (response.message) {
          addNotification(response.message, 'error');
        }
      }
    } catch (error: any) {
      console.error('[FileSelector] ファイル選択エラー:', error);
      addNotification('ファイルの選択中にエラーが発生しました', 'error');
    } finally {
      console.log('[FileSelector] ファイル選択処理完了');
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
      console.log('[FileSelector] ファイルアップロード開始:', file.name);
      // 開発環境の場合はファイルをアップロード
      const response = await uploadCSVFile(file);
      
      if (response.success && response.path) {
        console.log('[FileSelector] ファイルアップロード成功:', response.path);
        onSelectFile(response.path);
        addNotification(`ファイルをアップロードしました: ${file.name}`, 'success');
      } else {
        console.log('[FileSelector] ファイルアップロード失敗:', response.message);
        addNotification(response.message || 'ファイルのアップロードに失敗しました', 'error');
      }
    } catch (error: any) {
      console.error('[FileSelector] ファイルアップロードエラー:', error);
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