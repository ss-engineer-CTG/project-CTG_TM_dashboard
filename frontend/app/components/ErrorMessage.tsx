'use client';

import React, { useState } from 'react';

interface ErrorMessageProps {
  message: string;
  details?: any;
  onRetry?: () => void;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, details, onRetry }) => {
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <div className="dashboard-card bg-red-900 bg-opacity-20 mb-4">
      <div className="flex items-start">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <h3 className="text-red-400 font-medium">エラーが発生しました</h3>
          <p className="mt-1 text-white">{message}</p>
          
          {details && (
            <div className="mt-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-red-300 text-sm hover:text-red-100 flex items-center"
              >
                {showDetails ? '詳細を隠す' : '詳細を表示'}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-4 w-4 ml-1 transition-transform ${showDetails ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showDetails && (
                <pre className="mt-2 p-3 bg-gray-800 rounded text-xs overflow-auto max-h-40 text-gray-300">
                  {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      
      {onRetry && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onRetry}
            className="bg-red-600 hover:bg-red-700 text-white text-sm py-1 px-3 rounded transition-colors"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
};

export default ErrorMessage;