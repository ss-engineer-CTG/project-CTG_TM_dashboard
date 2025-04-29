import { 
  Project, 
  DashboardMetrics, 
  RecentTasks,
  ErrorInfo,
  ProjectSummary 
} from './models';

// コンポーネントProps型定義

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
  summary: ProjectSummary;
  isLoading: boolean;
}

export interface ProgressBarProps {
  progress: number;
  color: string;
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