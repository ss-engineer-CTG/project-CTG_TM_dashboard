from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
import logging

from app.models.schemas import Project, RecentTasks
from app.services.data_processing import (
    async_load_and_process_data, async_calculate_progress, async_get_recent_tasks
)

router = APIRouter()
logger = logging.getLogger("api.projects")

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
        # データの読み込みと処理 - 非同期版
        df = await async_load_and_process_data(file_path)
        
        # プロジェクト進捗の計算 - 非同期版
        progress_data = await async_calculate_progress(df)
        
        # デバッグ情報のログ出力
        logger.debug(f"進捗データの列: {progress_data.columns.tolist()}")
        
        # Pydanticモデルに変換
        projects = []
        
        # pandasのインポート
        from app.services.async_loader import lazy_import
        pd = lazy_import("pandas")
        
        for _, row in progress_data.iterrows():
            # データ型の変換を行う（特に数値から文字列への変換）
            try:
                project = Project(
                    project_id=str(row['project_id']),  # 明示的に文字列に変換
                    project_name=str(row['project_name']),
                    process=str(row['process']) if not pd.isna(row['process']) else "",
                    line=str(row['line']) if not pd.isna(row['line']) else "",
                    total_tasks=int(row['total_tasks']),
                    completed_tasks=int(row['completed_tasks']),
                    milestone_count=int(row['milestone_count']),
                    start_date=row['start_date'],
                    end_date=row['end_date'],
                    project_path=str(row['project_path']) if 'project_path' in row and not pd.isna(row['project_path']) else None,
                    ganttchart_path=str(row['ganttchart_path']) if 'ganttchart_path' in row and not pd.isna(row['ganttchart_path']) else None,
                    progress=float(row['progress']),
                    duration=int(row['duration'])
                )
                projects.append(project)
            except Exception as e:
                logger.error(f"プロジェクトデータの変換エラー: {e}, Row: {row}")
        
        logger.info(f"{len(projects)}件のプロジェクトを取得しました")
        return projects
        
    except Exception as e:
        logger.error(f"データの取得に失敗しました: {str(e)}", exc_info=True)
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
        # データの読み込みと処理 - 非同期版
        df = await async_load_and_process_data(file_path)
        
        # プロジェクト進捗の計算 - 非同期版
        progress_data = await async_calculate_progress(df)
        
        # project_idを文字列として扱う
        project_id_str = str(project_id)
        
        # pandasのインポート
        from app.services.async_loader import lazy_import
        pd = lazy_import("pandas")
        
        # 該当プロジェクトのデータを抽出
        # 数値型のproject_idも文字列として比較できるように変換
        project_data = progress_data[progress_data['project_id'].astype(str) == project_id_str]
        
        if len(project_data) == 0:
            raise HTTPException(status_code=404, detail=f"プロジェクトが見つかりません: {project_id}")
        
        row = project_data.iloc[0]
        
        # Pydanticモデルに変換
        project = Project(
            project_id=str(row['project_id']),  # 明示的に文字列に変換
            project_name=str(row['project_name']),
            process=str(row['process']) if not pd.isna(row['process']) else "",
            line=str(row['line']) if not pd.isna(row['line']) else "",
            total_tasks=int(row['total_tasks']),
            completed_tasks=int(row['completed_tasks']),
            milestone_count=int(row['milestone_count']),
            start_date=row['start_date'],
            end_date=row['end_date'],
            project_path=str(row['project_path']) if 'project_path' in row and not pd.isna(row['project_path']) else None,
            ganttchart_path=str(row['ganttchart_path']) if 'ganttchart_path' in row and not pd.isna(row['ganttchart_path']) else None,
            progress=float(row['progress']),
            duration=int(row['duration'])
        )
        
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"データの取得に失敗しました: {str(e)}", exc_info=True)
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
        # データの読み込みと処理 - 非同期版
        df = await async_load_and_process_data(file_path)
        
        # project_idを文字列として扱う
        project_id_str = str(project_id)
        
        # project_idが数値型の場合に対応
        df_with_str_id = df.copy()
        df_with_str_id['project_id'] = df_with_str_id['project_id'].astype(str)
        
        # プロジェクトの直近のタスク情報を取得 - 非同期版
        recent_tasks = await async_get_recent_tasks(df_with_str_id, project_id_str)
        
        return RecentTasks(**recent_tasks)
        
    except Exception as e:
        logger.error(f"直近タスク情報の取得に失敗しました: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"直近タスク情報の取得に失敗しました: {str(e)}")