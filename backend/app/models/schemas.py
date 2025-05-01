from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum


class Task(BaseModel):
    task_id: str
    task_name: str
    task_status: str
    task_start_date: datetime
    task_finish_date: datetime
    task_milestone: str


# マイルストーンのステータス列挙型
class MilestoneStatus(str, Enum):
    COMPLETED = "completed"
    IN_PROGRESS = "in-progress"
    NOT_STARTED = "not-started"
    DELAYED = "delayed"


# マイルストーンスキーマ
class Milestone(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    planned_date: datetime
    actual_date: Optional[datetime] = None
    status: MilestoneStatus
    category: Optional[str] = None
    owner: Optional[str] = None
    dependencies: Optional[List[str]] = None
    project_id: str


class Project(BaseModel):
    # 既存のフィールド
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
    next_milestone: Optional[str] = None
    has_delay: bool = False
    
    # 新しいフィールド
    milestones: Optional[List[Milestone]] = None


class ProjectSummary(BaseModel):
    total_projects: int
    active_projects: int
    delayed_projects: int
    milestone_projects: int


class DashboardMetrics(BaseModel):
    summary: ProjectSummary
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


# タイムライン取得用レスポンススキーマ
class MilestoneTimelineResponse(BaseModel):
    projects: List[Project]