import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="dashboard-card max-w-lg w-full text-center">
        <h2 className="text-text-primary text-xl font-bold mb-4">ページが見つかりません</h2>
        <p className="text-text-secondary mb-6">
          お探しのページは存在しないか、移動された可能性があります。
        </p>
        <Link 
          href="/"
          className="bg-text-accent text-surface px-4 py-2 rounded text-sm hover:bg-opacity-80 transition-colors"
        >
          ダッシュボードに戻る
        </Link>
      </div>
    </div>
  );
}