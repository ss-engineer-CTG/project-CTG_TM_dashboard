// ダッシュボード全体の概要データ
export interface DashboardSummary {
    total_projects: number;
    active_projects: number;
    delayed_projects: number;
    milestone_projects: number;
    update_time: string;
  }
  
  // タスク進捗情報
  export interface TaskProgress {
    completed: number;
    total: number;
  }
  
  // マイルストーン情報
  export interface Milestone {
    name: string;
    days_until: number;
    date: string;
  }
  
  // パス情報
  export interface ProjectPaths {
    project_path: string;
    ganttchart_path: string;
  }
  
  // タスク情報
  export interface Task {
    id: string;
    name: string;
    days_delay?: number;
    days_remaining?: number;
    days_to_start?: number;
  }
  
  // プロジェクトの直近タスク情報
  export interface RecentTasks {
    delayed: Task[];
    in_progress: Task[];
    upcoming: Task[];
  }
  
  // プロジェクトデータ
  export interface ProjectData {
    id: string;
    name: string;
    process: string;
    line: string;
    progress: number;
    has_delay: boolean;
    status: string;
    next_milestone: Milestone | null;
    task_progress: TaskProgress;
    recent_tasks: RecentTasks;
    paths: ProjectPaths;
    duration: number;
  }
  
  // チャートデータ
  export interface ChartData {
    labels: string[];
    data: number[];
  }
  
  // API応答データ
  export interface DashboardApiResponse {
    summary: DashboardSummary;
    projects: ProjectData[];
    charts: {
      progress_distribution: ChartData;
      duration_distribution: ChartData;
    };
  }
  
  // ファイル情報
  export interface FileInfo {
    path: string;
  }
  
  // ファイル操作結果
  export interface FileOperationResult {
    success: boolean;
    message: string;
  }