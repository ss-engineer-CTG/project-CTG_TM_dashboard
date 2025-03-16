'use client';

import React from 'react';
import { useQuery } from 'react-query';
import { RecentTasks } from '@/app/lib/types';
import { getRecentTasks } from '@/app/lib/api';

interface RecentTasksInfoProps {
  projectId: string;
  filePath?: string;
}

const RecentTasksInfo: React.FC<RecentTasksInfoProps> = ({ projectId, filePath }) => {
  const { data, isLoading, error } = useQuery<RecentTasks, Error>(
    ['recentTasks', projectId, filePath],
    () => getRecentTasks(projectId, filePath),
    { staleTime: 1000 * 60 * 5 } // 5分間キャッシュ
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-status-danger italic text-sm">
        データ取得エラー
      </div>
    );
  }

  return (
    <div className="text-sm">
      <div>
        <span className="font-bold text-status-danger">遅延中: </span>
        {data.delayed ? (
          <span className="text-text-primary">{data.delayed.name}</span>
        ) : (
          <span className="italic text-text-secondary">なし</span>
        )}
      </div>
      
      <div>
        <span className="font-bold text-status-info">進行中: </span>
        {data.in_progress ? (
          <span className="text-text-primary">{data.in_progress.name}</span>
        ) : (
          <span className="italic text-text-secondary">なし</span>
        )}
      </div>
      
      <div>
        <span className="font-bold text-text-accent">次のタスク: </span>
        {data.next_task ? (
          <span className="text-text-primary">{data.next_task.name}</span>
        ) : (
          <span className="italic text-text-secondary">なし</span>
        )}
      </div>
      
      <div>
        <span className="font-bold text-text-secondary">次の次: </span>
        {data.next_next_task ? (
          <span className="text-text-primary">{data.next_next_task.name}</span>
        ) : (
          <span className="italic text-text-secondary">なし</span>
        )}
      </div>
    </div>
  );
};

export default RecentTasksInfo;