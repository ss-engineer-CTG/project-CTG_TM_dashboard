import { 
  Project, 
  DashboardMetrics, 
  RecentTasks,
  ErrorInfo,
  ProgressDistribution,
  DurationDistribution,
  ProjectSummary // ProjectSummary をインポートに追加
} from './models';

// コンポーネントProps型定義

export interface DashboardChartsProps {
  metrics: DashboardMetrics;
  isLoading: boolean;
}

export interface DurationChartProps {
  data: DurationDistribution;
  isLoading: boolean;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export interface ErrorMessageProps {
  message: string;
  details?: any;
  onRetry?: () => void;
}

export interface FileSelectorProps {
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}

export interface HeaderProps {
  updateTime: string;
  onRefresh: () => void;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
}

export interface MetricsCardsProps {
  summary: ProjectSummary; // Project['project_summary'] から ProjectSummary に修正
  isLoading: boolean;
}

export interface ProgressBarProps {
  progress: number;
  color: string;
}

export interface ProgressChartProps {
  data: ProgressDistribution;
  isLoading: boolean;
}

export interface ProjectTableProps {
  projects: Project[];
  isLoading: boolean;
  onOpenFile: (path: string) => void;
  filePath?: string;
}

export interface RecentTasksInfoProps {
  projectId: string;
  filePath?: string;
}