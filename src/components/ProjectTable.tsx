import React, { useMemo, lazy, useEffect } from 'react';
import { ProjectTableProps } from '../types';
import { LazyLoadWrapper } from './LazyLoadWrapper';

// 遅延ロードするコンポーネント
const ProgressBar = lazy(() => import('./ProgressBar'));
const RecentTasksInfo = lazy(() => import('./RecentTasksInfo'));

const ProjectTable: React.FC<ProjectTableProps> = ({ projects, isLoading, onOpenFile, filePath }) => {
  // ステータス色を取得
  const getStatusColor = (progress: number, hasDelay: boolean): string => {
    if (hasDelay) return '#ff5f5f'; // danger
    if (progress >= 90) return '#50ff96'; // success
    if (progress >= 70) return '#60cdff'; // info
    if (progress >= 50) return '#ffeb45'; // warning
    return '#c8c8c8'; // neutral
  };
  
  // 状態テキストの色を取得 - 改善版
  const getStatusTextClass = (statusText: string): string => {
    // デバッグログ追加
    console.log(`Status text for class: "${statusText}"`);
    
    // 文字列を正規化
    const normalizedText = statusText.trim();
    
    // 部分一致を許容する堅牢な実装
    if (normalizedText.includes('遅延')) return 'text-status-danger';
    if (normalizedText.includes('進行')) return 'text-status-info';
    if (normalizedText.includes('完了')) return 'text-status-success';
    
    // 一致しない場合はデフォルト
    console.log(`No match found for: "${normalizedText}"`);
    return 'text-text-primary';
  };

  // プロジェクト表示用データをメモ化
  const projectRows = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    
    return projects.map(project => {
      // バックエンドから取得した遅延フラグを使用
      const hasDelay = project.has_delay;
      const statusColor = getStatusColor(project.progress, hasDelay);
      const status = hasDelay ? '遅延あり' : project.progress < 100 ? '進行中' : '完了';
      
      // デバッグログ追加
      console.log(`Project: ${project.project_name}`);
      console.log(`Status: "${status}"`); // 引用符で囲んで空白を視覚化
      
      // 状態テキストに対応する色クラス
      const statusClass = getStatusTextClass(status);
      console.log(`Status Class: ${statusClass}`);
      
      return {
        project,
        hasDelay,
        statusColor,
        status,
        statusClass
      };
    });
  }, [projects]);
  
  // コンポーネントロード時に追加のデバッグログ
  useEffect(() => {
    if (projects && projects.length > 0) {
      console.log('Projects loaded:', projects.length);
      
      // サンプルプロジェクトのStatus値をデバッグ
      const sampleProject = projects[0];
      const status = sampleProject.has_delay ? '遅延あり' : sampleProject.progress < 100 ? '進行中' : '完了';
      console.log(`Sample project status: "${status}"`);
      console.log(`Class for sample: ${getStatusTextClass(status)}`);
    }
  }, [projects]);

  // ローディング表示
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
            {projectRows.map(({ project, statusColor, status, statusClass }) => (
              <tr key={project.project_id}>
                <td className="min-w-[150px]">{project.project_name}</td>
                <td className="min-w-[100px]">{project.process}</td>
                <td className="min-w-[100px]">{project.line}</td>
                <td className="min-w-[150px] text-center">
                  <LazyLoadWrapper>
                    <ProgressBar progress={project.progress} color={statusColor} />
                  </LazyLoadWrapper>
                </td>
                {/* 状態列 - カラークラスを適用 + フォールバックとしてインラインスタイルも追加 */}
                <td 
                  className={`min-w-[100px] ${statusClass} font-medium`}
                  style={{ 
                    color: status.includes('遅延') ? '#ff5f5f' : 
                           status.includes('進行') ? '#60cdff' : 
                           status.includes('完了') ? '#50ff96' : 
                           undefined 
                  }}
                >
                  {status}
                </td>
                <td className="min-w-[200px]">{project.next_milestone || '-'}</td>
                <td className="min-w-[100px] text-center">
                  {project.completed_tasks}/{project.total_tasks}
                </td>
                <td className="min-w-[300px] max-w-[400px]">
                  <LazyLoadWrapper>
                    <RecentTasksInfo 
                      projectId={project.project_id} 
                      filePath={filePath} 
                    />
                  </LazyLoadWrapper>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectTable;