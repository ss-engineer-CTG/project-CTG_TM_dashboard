import React from 'react';
import { ProjectSummary } from '../types';

interface MetricsCardsProps {
  summary: ProjectSummary;
  isLoading: boolean;
}

const MetricsCards: React.FC<MetricsCardsProps> = ({ summary, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i} 
            className="bg-surface rounded-lg shadow-card p-4 animate-pulse h-24"
          >
            <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-700 rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="dashboard-card">
        <h3 className="text-text-secondary text-sm font-medium">総プロジェクト数</h3>
        <h2 className="text-text-primary text-2xl font-bold">{summary.total_projects}</h2>
      </div>
      
      <div className="dashboard-card">
        <h3 className="text-text-secondary text-sm font-medium">進行中</h3>
        <h2 className="text-status-info text-2xl font-bold">{summary.active_projects}</h2>
      </div>
      
      <div className="dashboard-card">
        <h3 className="text-text-secondary text-sm font-medium">遅延あり</h3>
        <h2 className="text-status-danger text-2xl font-bold">{summary.delayed_projects}</h2>
      </div>
      
      <div className="dashboard-card">
        <h3 className="text-text-secondary text-sm font-medium">今月のマイルストーン</h3>
        <h2 className="text-status-warning text-2xl font-bold">{summary.milestone_projects}</h2>
      </div>
    </div>
  );
};

export default MetricsCards;