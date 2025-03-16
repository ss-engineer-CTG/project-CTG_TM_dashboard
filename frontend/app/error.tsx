'use client';

import React from 'react';
import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // エラーをログに記録
    console.error('アプリケーションエラー:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="dashboard-card max-w-lg w-full text-center">
        <h2 className="text-status-danger text-xl font-bold mb-4">エラーが発生しました</h2>
        <p className="text-text-secondary mb-4">
          アプリケーションで予期しないエラーが発生しました。
        </p>
        <div className="bg-surface rounded p-4 mb-6 text-left">
          <p className="text-text-secondary truncate">{error.message}</p>
          {error.digest && (
            <p className="text-text-secondary text-xs mt-2">
              エラー参照: {error.digest}
            </p>
          )}
        </div>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => window.location.href = '/'}
            className="bg-surface text-text-accent px-4 py-2 rounded border border-text-accent text-sm hover:bg-text-accent hover:text-surface transition-colors"
          >
            ホームに戻る
          </button>
          <button
            onClick={() => reset()}
            className="bg-text-accent text-surface px-4 py-2 rounded text-sm hover:bg-opacity-80 transition-colors"
          >
            再試行
          </button>
        </div>
      </div>
    </div>
  );
}