import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HeaderProps } from '../types';
import FileSelector from './FileSelector';

const Header: React.FC<HeaderProps> = ({ 
  updateTime, 
  onRefresh, 
  selectedFilePath, 
  onSelectFile 
}) => {
  const location = useLocation();

  return (
    <header className="bg-surface border-b border-opacity-10 border-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">プロジェクト進捗ダッシュボード</h1>
            <p className="text-text-secondary text-sm">{updateTime}</p>
          </div>
          
          <div className="flex items-center mt-2 md:mt-0">
            <FileSelector 
              onSelectFile={onSelectFile} 
              selectedFilePath={selectedFilePath}
            />
            
            <button
              onClick={onRefresh}
              className="bg-text-accent text-surface px-2.5 py-1.5 rounded text-xs hover:bg-opacity-80 transition-colors ml-2"
              aria-label="データを更新"
              title="データを更新"
            >
              更新
            </button>
          </div>
        </div>
        
        {/* ナビゲーションメニュー */}
        <nav className="mt-4">
          <ul className="flex space-x-4">
            <li>
              <Link 
                to="/" 
                className={`px-3 py-2 rounded text-sm transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-text-accent text-surface font-medium' 
                    : 'text-text-primary hover:bg-gray-700'
                }`}
              >
                ダッシュボード
              </Link>
            </li>
            <li>
              <Link 
                to="/milestones" 
                className={`px-3 py-2 rounded text-sm transition-colors ${
                  location.pathname === '/milestones' 
                    ? 'bg-text-accent text-surface font-medium' 
                    : 'text-text-primary hover:bg-gray-700'
                }`}
              >
                マイルストーンタイムライン
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;