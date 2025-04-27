import React from 'react';
import { ProgressBarProps } from '../types';

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, color }) => {
  // 進捗率が範囲外の場合は調整
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  
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
      <div className="progress-text">
        {normalizedProgress.toFixed(1)}%
      </div>
    </div>
  );
};

export default ProgressBar;