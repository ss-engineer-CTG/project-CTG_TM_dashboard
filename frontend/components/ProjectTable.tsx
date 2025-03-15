'use client';

import React from 'react';
import { ProjectData } from '@/types/dashboard';
import ProgressBar from './ProgressBar';
import { FiFolder, FiFileText } from 'react-icons/fi';
import { useDashboard } from '@/contexts/DashboardContext';

interface ProjectTableProps {
  projects: ProjectData[];
}

export default function ProjectTable({ projects }: ProjectTableProps) {
  const { showNotification } = useDashboard();

  // ファイルまたはフォルダを開く関数
  const handleOpenPath = async (path: string, isDirectory: boolean = false) => {
    try {
      const response = await fetch('http://localhost:8000/api/open-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          path
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        showNotification(
          isDirectory ? 'フォルダを開きました' : 'ファイルを開きました', 
          'success'
        );
      } else {
        showNotification(result.message || 'ファイルを開けませんでした', 'error');
      }
    } catch (error) {
      console.error('ファイルオープンエラー:', error);
      showNotification('ファイルを開けませんでした', 'error');
    }
  };

  if (projects.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-light-secondary">プロジェクトデータがありません</p>
      </div>
    );
  }

  return (
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
        {projects.map((project) => (
          <tr key={project.id}>
            <td className="min-w-[150px]">{project.name}</td>
            <td>{project.process}</td>
            <td>{project.line}</td>
            <td className="min-w-[150px]">
              <ProgressBar 
                progress={project.progress} 
                hasDelay={project.has_delay} 
              />
            </td>
            <td className={project.has_delay ? 'text-danger' : 'text-light-primary'}>
              {project.status}
            </td>
            <td className="min-w-[200px]">
              {project.next_milestone ? (
                <span>
                  {project.next_milestone.name} ({project.next_milestone.days_until}日後)
                </span>
              ) : (
                '-'
              )}
            </td>
            <td className="text-center">
              {project.task_progress.completed}/{project.task_progress.total}
            </td>
            <td className="min-w-[300px] max-w-[400px]">
              <div className="text-sm space-y-1">
                {/* 遅延中タスク */}
                <div>
                  <span className="font-semibold text-danger">遅延中: </span>
                  {project.recent_tasks.delayed.length > 0 ? (
                    <span className="break-words">
                      {project.recent_tasks.delayed[0].name}
                    </span>
                  ) : (
                    <span className="italic text-light-secondary">なし</span>
                  )}
                </div>
                
                {/* 進行中タスク */}
                <div>
                  <span className="font-semibold text-info">進行中: </span>
                  {project.recent_tasks.in_progress.length > 0 ? (
                    <span className="break-words">
                      {project.recent_tasks.in_progress[0].name}
                    </span>
                  ) : (
                    <span className="italic text-light-secondary">なし</span>
                  )}
                </div>
                
                {/* 次のタスク */}
                <div>
                  <span className="font-semibold text-accent">次のタスク: </span>
                  {project.recent_tasks.upcoming.length > 0 ? (
                    <span className="break-words">
                      {project.recent_tasks.upcoming[0].name}
                    </span>
                  ) : (
                    <span className="italic text-light-secondary">なし</span>
                  )}
                </div>
                
                {/* 次の次のタスク */}
                <div>
                  <span className="font-semibold text-light-secondary">次の次: </span>
                  {project.recent_tasks.upcoming.length > 1 ? (
                    <span className="break-words">
                      {project.recent_tasks.upcoming[1].name}
                    </span>
                  ) : (
                    <span className="italic text-light-secondary">なし</span>
                  )}
                </div>
              </div>
            </td>
            <td className="text-center whitespace-nowrap">
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => handleOpenPath(project.paths.project_path, true)}
                  className="link-button"
                  disabled={!project.paths.project_path}
                >
                  <FiFolder className="mr-1" />
                  フォルダを開く
                </button>
                <button
                  onClick={() => handleOpenPath(project.paths.ganttchart_path, false)}
                  className="link-button"
                  disabled={!project.paths.ganttchart_path}
                >
                  <FiFileText className="mr-1" />
                  工程表を開く
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}