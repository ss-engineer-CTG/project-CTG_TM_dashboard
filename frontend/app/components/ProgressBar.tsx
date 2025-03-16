'use client';

import React from 'react';

interface ProgressBarProps {
  progress: number;
  color: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, color }) => {
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar"
        style={{ 
          width: `${progress}%`,
          backgroundColor: color,
        }}
      />
      <div className="progress-text">
        {progress.toFixed(1)}%
      </div>
    </div>
  );
};

export default ProgressBar;