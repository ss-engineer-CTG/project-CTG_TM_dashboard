import React from 'react';
import { ProgressBarProps } from '../types';

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, color }) => {
  // 進捗率が範囲外の場合は調整
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  
  // 進捗テキストの色を背景色に応じて動的に変更
  const getTextColor = (): string => {
    // 明るい背景（黄色や緑）の場合は暗いテキスト
    if (
      (color === '#50ff96' && normalizedProgress > 30) || // 緑色
      (color === '#ffeb45' && normalizedProgress > 30)    // 黄色
    ) {
      return 'text-gray-800';
    }
    return 'text-white';
  };
  
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar"
        style={{ 
          width: `${normalizedProgress}%`,
          backgroundColor: color,
        }}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedProgress}
        role="progressbar"
      />
      <div className={`progress-text ${getTextColor()}`}>
        {normalizedProgress.toFixed(1)}%
      </div>
    </div>
  );
};

export default ProgressBar;