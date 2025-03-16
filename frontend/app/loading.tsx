import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="dashboard-card p-8 flex flex-col items-center">
        <div className="mb-4 text-text-primary text-lg">ダッシュボードを読み込み中...</div>
        <div className="relative w-16 h-16">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-text-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    </div>
  );
}