export interface Project {
  project_id: string;
  project_name: string;
  process: string;
  line: string;
  total_tasks: number;
  completed_tasks: number;
  milestone_count: number;
  start_date: string;
  end_date: string;
  project_path: string | null;
  ganttchart_path: string | null;
  progress: number;
  duration: number;
  tasks?: Task[];
}

export interface Task {
  task_id: string;
  task_name: string;
  task_status: string;
  task_start_date: string;
  task_finish_date: string;
  task_milestone: string;
}

export interface ProjectSummary {
  total_projects: number;
  active_projects: number;
  delayed_projects: number;
  milestone_projects: number;
}

export interface ProgressDistribution {
  ranges: string[];
  counts: number[];
}

export interface DurationDistribution {
  ranges: string[];
  counts: number[];
}

export interface DashboardMetrics {
  summary: ProjectSummary;
  progress_distribution: ProgressDistribution;
  duration_distribution: DurationDistribution;
  last_updated: string;
}

export interface FilePath {
  path: string;
}

export interface FileResponse {
  success: boolean;
  message: string;
  path?: string;
}

export interface RecentTasks {
  delayed: DelayedTask | null;
  in_progress: InProgressTask | null;
  next_task: NextTask | null;
  next_next_task: NextTask | null;
}

interface DelayedTask {
  name: string;
  days_delayed: number;
}

interface InProgressTask {
  name: string;
  days_remaining: number;
}

interface NextTask {
  name: string;
  days_until: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error';
  duration?: number;
}

// 新規追加: API応答の型定義
export interface HealthResponse {
  status: string;
  time: string;
  version: string;
}

export interface ShutdownResponse {
  status: string;
}

export interface APIConnectionStatus {
  connected: boolean;
  loading: boolean;
  message: string;
  lastChecked: Date | null;
  details?: any;
}

export interface APIError extends Error {
  type: 'server_error' | 'network_error' | 'request_error';
  details: string;
  status?: number;
  isApiError: boolean;
}

// 既存の型を拡張して、エラー情報を含むようにする
export interface ErrorInfo {
  message: string;
  details?: any;
}