from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class Task(BaseModel):
    task_id: str
    task_name: str
    task_status: str
    task_start_date: datetime
    task_finish_date: datetime
    task_milestone: str


class Project(BaseModel):
    project_id: str
    project_name: str
    process: str
    line: str
    total_tasks: int
    completed_tasks: int
    milestone_count: int
    start_date: datetime
    end_date: datetime
    project_path: Optional[str] = None
    ganttchart_path: Optional[str] = None
    progress: float
    duration: int
    tasks: List[Task] = []


class ProjectSummary(BaseModel):
    total_projects: int
    active_projects: int
    delayed_projects: int
    milestone_projects: int


class ProgressDistribution(BaseModel):
    ranges: List[str]
    counts: List[int]


class DurationDistribution(BaseModel):
    ranges: List[str]
    counts: List[int]


class DashboardMetrics(BaseModel):
    summary: ProjectSummary
    progress_distribution: ProgressDistribution
    duration_distribution: DurationDistribution
    last_updated: str


class FilePath(BaseModel):
    path: str


class FileResponse(BaseModel):
    success: bool
    message: str
    path: Optional[str] = None


class RecentTasks(BaseModel):
    delayed: Optional[Dict[str, Any]] = None
    in_progress: Optional[Dict[str, Any]] = None
    next_task: Optional[Dict[str, Any]] = None
    next_next_task: Optional[Dict[str, Any]] = None