'use client';

import React from 'react';
import ProgressBar from './ProgressBar';
import RecentTasksInfo from './RecentTasksInfo';
import { Project } from '@/app/lib/types';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ProjectTableProps {
  projects: Project[];
  isLoading: boolean;
  onOpenFile: (path: string) => void;
  filePath?: string;
}

const ProjectTable: React.FC<ProjectTableProps> = ({ projects, isLoading, onOpenFile, filePath }) => {
  if (isLoading) {
    return (
      <div className="dashboard-card">
        <h2 className="text-text-primary text-lg font-medium mb-4">プロジェクト一覧</h2>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // プロジェクトがない場合
  if (!projects || projects.length === 0) {
    return (
      <div className="dashboard-card">
        <h2 className="text-text-primary text-lg font-medium mb-4">プロジェクト一覧</h2>
        <div className="text-text-secondary text-center py-8">
          プロジェクトがありません
        </div>
      </div>
    );
  }

  // ステータス色を取得
  const getStatusColor = (progress: number, hasDelay: boolean): string => {
    if (hasDelay) return '#ff5f5f'; // danger
    if (progress >= 90) return '#50ff96'; // success
    if (progress >= 70) return '#60cdff'; // info
    if (progress >= 50) return '#ffeb45'; // warning
    return '#c8c8c8'; // neutral
  };

  return (
    <div className="dashboard-card">
      <h2 className="text-text-primary text-lg font-medium mb-4">プロジェクト一覧</h2>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>プロジェクト</th>
              <th>工程</th>
              <th>ライン</th>
              <th className="text-center">進捗</th>
              <th>状態</th>
              <th>次のマイルストーン</th>
              <th className="text-center">タスク進捗</th>
              <th>直近のタスク</th>
              <th className="text-center">リンク</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const hasDelay = false; // APIから取得する必要があります
              const statusColor = getStatusColor(project.progress, hasDelay);
              const status = hasDelay ? '遅延あり' : project.progress < 100 ? '進行中' : '完了';
              const statusClass = hasDelay ? 'text-status-danger' : 'text-text-primary';
              
              return (
                <tr key={project.project_id}>
                  <td className="min-w-[150px]">{project.project_name}</td>
                  <td className="min-w-[100px]">{project.process}</td>
                  <td className="min-w-[100px]">{project.line}</td>
                  <td className="min-w-[150px] text-center">
                    <ProgressBar progress={project.progress} color={statusColor} />
                  </td>
                  <td className={`min-w-[100px] ${statusClass}`}>{status}</td>
                  <td className="min-w-[200px]">-</td>
                  <td className="min-w-[100px] text-center">
                    {project.completed_tasks}/{project.total_tasks}
                  </td>
                  <td className="min-w-[300px] max-w-[400px]">
                    <RecentTasksInfo 
                      projectId={project.project_id} 
                      filePath={filePath} 
                    />
                  </td>
                  <td className="min-w-[200px] text-center whitespace-nowrap">
                    <div className="flex gap-2 justify-center">
                      {project.project_path && (
                        <button
                          onClick={() => onOpenFile(project.project_path!)}
                          className="link-button"
                        >
                          フォルダを開く
                        </button>
                      )}
                      {project.ganttchart_path && (
                        <button
                          onClick={() => onOpenFile(project.ganttchart_path!)}
                          className="link-button"
                        >
                          工程表を開く
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectTable;