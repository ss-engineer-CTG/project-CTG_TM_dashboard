'use client';

import React from 'react';

interface ProgressBarProps {
  progress: number;
  hasDelay: boolean;
}

export default function ProgressBar({ progress, hasDelay }: ProgressBarProps) {
  // 進捗状況に応じた色を決定
  const getStatusColor = (progress: number, hasDelay: boolean): string => {
    if (hasDelay) {
      return 'bg-danger';
    } else if (progress >= 90) {
      return 'bg-success';
    } else if (progress >= 70) {
      return 'bg-info';
    } else if (progress >= 50) {
      return 'bg-warning';
    }
    return 'bg-neutral';
  };

  const color = getStatusColor(progress, hasDelay);
  
  return (
    <div className="progress-bar">
      <div
        className={`h-full ${color}`}
        style={{ width: `${progress}%` }}
      ></div>
      <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium">
        {progress.toFixed(1)}%
      </div>
    </div>
  );
}