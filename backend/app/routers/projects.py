from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List

from app.models.schemas import Project, RecentTasks
from app.services.data_processing import load_and_process_data, calculate_progress, get_recent_tasks

router = APIRouter()

@router.get("/projects", response_model=List[Project])
async def get_projects(file_path: str = Query(None)):
    """
    プロジェクト一覧を取得する
    
    Args:
        file_path: ダッシュボードCSVファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        プロジェクト一覧
    """
    try:
        # データの読み込みと処理
        df = load_and_process_data(file_path)
        
        # プロジェクト進捗の計算
        progress_data = calculate_progress(df)
        
        # Pydanticモデルに変換
        projects = []
        for _, row in progress_data.iterrows():
            project = Project(
                project_id=row['project_id'],
                project_name=row['project_name'],
                process=row['process'],
                line=row['line'],
                total_tasks=row['total_tasks'],
                completed_tasks=row['completed_tasks'],
                milestone_count=row['milestone_count'],
                start_date=row['start_date'],
                end_date=row['end_date'],
                project_path=row['project_path'] if 'project_path' in row else None,
                ganttchart_path=row['ganttchart_path'] if 'ganttchart_path' in row else None,
                progress=row['progress'],
                duration=row['duration']
            )
            projects.append(project)
        
        return projects
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データの取得に失敗しました: {str(e)}")

@router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, file_path: str = Query(None)):
    """
    プロジェクト詳細を取得する
    
    Args:
        project_id: プロジェクトID
        file_path: ダッシュボードCSVファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        プロジェクト詳細
    """
    try:
        # データの読み込みと処理
        df = load_and_process_data(file_path)
        
        # プロジェクト進捗の計算
        progress_data = calculate_progress(df)
        
        # 該当プロジェクトのデータを抽出
        project_data = progress_data[progress_data['project_id'] == project_id]
        
        if len(project_data) == 0:
            raise HTTPException(status_code=404, detail=f"プロジェクトが見つかりません: {project_id}")
        
        row = project_data.iloc[0]
        
        # Pydanticモデルに変換
        project = Project(
            project_id=row['project_id'],
            project_name=row['project_name'],
            process=row['process'],
            line=row['line'],
            total_tasks=row['total_tasks'],
            completed_tasks=row['completed_tasks'],
            milestone_count=row['milestone_count'],
            start_date=row['start_date'],
            end_date=row['end_date'],
            project_path=row['project_path'] if 'project_path' in row else None,
            ganttchart_path=row['ganttchart_path'] if 'ganttchart_path' in row else None,
            progress=row['progress'],
            duration=row['duration']
        )
        
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データの取得に失敗しました: {str(e)}")

@router.get("/projects/{project_id}/recent-tasks", response_model=RecentTasks)
async def get_project_recent_tasks(project_id: str, file_path: str = Query(None)):
    """
    プロジェクトの直近のタスク情報を取得する
    
    Args:
        project_id: プロジェクトID
        file_path: ダッシュボードCSVファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        直近のタスク情報
    """
    try:
        # データの読み込みと処理
        df = load_and_process_data(file_path)
        
        # プロジェクトの直近のタスク情報を取得
        recent_tasks = get_recent_tasks(df, project_id)
        
        return RecentTasks(**recent_tasks)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"直近タスク情報の取得に失敗しました: {str(e)}")