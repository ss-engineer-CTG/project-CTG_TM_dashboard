from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import logging

from app.models.schemas import Project, RecentTasks
from app.services.data_processing import (
    async_load_and_process_data, async_calculate_progress, async_get_recent_tasks,
    get_next_milestone, next_milestone_format, check_delays
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
        
        # データフレームの基本情報をログ出力
        logger.info(f"データフレーム行数: {df.shape[0]}, 列数: {df.shape[1]}")
        logger.info(f"列名: {df.columns.tolist()}")
        
        # 遅延タスクの検出 - 修正: 明示的に日付のみで比較
        delayed_tasks_df = check_delays(df)
        # 文字列型に統一して比較するために明示的に変換
        delayed_project_ids = set(delayed_tasks_df['project_id'].astype(str).unique())
        logger.info(f"遅延プロジェクト数: {len(delayed_project_ids)}")
        logger.info(f"遅延プロジェクトID: {delayed_project_ids}")
        
        # 遅延タスクのサンプルログ
        if not delayed_tasks_df.empty:
            sample = delayed_tasks_df.head(3)
            logger.info(f"遅延タスクサンプル:\n{sample[['project_id', 'task_id', 'task_name', 'task_finish_date', 'task_status']]}")
        
        # マイルストーン列の値をログ出力
        if 'task_milestone' in df.columns:
            unique_values = df['task_milestone'].unique()
            logger.info(f"task_milestone列のユニーク値: {unique_values}")
            milestone_count = df[df['task_milestone'] == '○'].shape[0]
            logger.info(f"'○'マークのあるタスク数: {milestone_count}")
        
        # 日付列の状態をログ出力
        if 'task_finish_date' in df.columns:
            date_sample = df['task_finish_date'].head(3).tolist()
            logger.info(f"task_finish_date列のサンプル: {date_sample}")
            
            # 現在日付との比較
            import datetime as dt
            current_date = dt.datetime.now()
            logger.info(f"現在日付: {current_date}")
            
            # 現在日付から時刻情報を除外して比較するために修正
            current_date_only = current_date.replace(hour=0, minute=0, second=0, microsecond=0).date()
            future_dates = df[df['task_finish_date'].dt.date > current_date_only].shape[0]
            logger.info(f"現在日付より未来の日付を持つタスク数: {future_dates}")
            
            # 遅延タスク数のチェック - 修正: 日付部分のみで比較
            delayed_tasks_count = len(df[(df['task_finish_date'].dt.date < current_date_only) & (df['task_status'] != '完了')])
            logger.info(f"遅延タスク数（期限切れで未完了）: {delayed_tasks_count}")
        
        # プロジェクト進捗の計算 - 非同期版
        progress_data = await async_calculate_progress(df)
        
        # 次のマイルストーン情報を取得（過去のマイルストーンも含むオプションを追加）
        next_milestones = get_next_milestone(df, include_past=True)
        logger.info(f"取得されたマイルストーン数: {next_milestones.shape[0]}")
        
        # デバッグ情報のログ出力
        logger.debug(f"進捗データの列: {progress_data.columns.tolist()}")
        
        # Pydanticモデルに変換
        projects = []
        
        # pandasのインポート
        from app.services.async_loader import lazy_import
        pd = lazy_import("pandas")
        
        for _, row in progress_data.iterrows():
            try:
                # プロジェクトIDを文字列に変換 - 明示的な変換で一貫性を確保
                project_id_str = str(row['project_id'])
                
                # 遅延状態のチェック - 明示的な変換と比較で一貫性を確保
                has_delay = project_id_str in delayed_project_ids
                logger.debug(f"プロジェクト {project_id_str} の遅延状態: {has_delay}")
                
                # マイルストーン情報をフォーマット
                milestone_info = next_milestone_format(next_milestones, project_id_str)
                logger.debug(f"プロジェクトID {project_id_str} のマイルストーン情報: {milestone_info}")
                
                project = Project(
                    project_id=project_id_str,
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
                    duration=int(row['duration']),
                    next_milestone=milestone_info,
                    has_delay=has_delay  # 明示的に遅延フラグを設定
                )
                projects.append(project)
            except Exception as e:
                logger.error(f"プロジェクトデータの変換エラー: {e}, Row: {row}")
        
        logger.info(f"{len(projects)}件のプロジェクトを取得しました")
        
        # 遅延フラグ統計を出力
        delayed_projects_count = sum(1 for p in projects if p.has_delay)
        logger.info(f"遅延フラグありのプロジェクト: {delayed_projects_count}/{len(projects)}")
        
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
        
        # 遅延タスクの検出 - 修正: 明示的に日付のみで比較
        delayed_tasks_df = check_delays(df)
        # 文字列型に統一して比較するために明示的に変換
        delayed_project_ids = set(delayed_tasks_df['project_id'].astype(str).unique())
        logger.info(f"遅延プロジェクト数: {len(delayed_project_ids)}")
        
        # プロジェクト進捗の計算 - 非同期版
        progress_data = await async_calculate_progress(df)
        
        # 次のマイルストーン情報を取得（過去のマイルストーンも含む）
        next_milestones = get_next_milestone(df, include_past=True)
        
        # project_idを文字列として扱う - 明示的な変換
        project_id_str = str(project_id)
        logger.debug(f"リクエストされたプロジェクトID: {project_id}, 変換後: {project_id_str}")
        
        # pandasのインポート
        from app.services.async_loader import lazy_import
        pd = lazy_import("pandas")
        
        # 該当プロジェクトのデータを抽出 - プロジェクトIDを文字列として比較
        project_data = progress_data[progress_data['project_id'].astype(str) == project_id_str]
        
        if len(project_data) == 0:
            raise HTTPException(status_code=404, detail=f"プロジェクトが見つかりません: {project_id}")
        
        row = project_data.iloc[0]
        
        # 遅延状態のチェック - 明示的に文字列変換して厳密に比較
        has_delay = project_id_str in delayed_project_ids
        logger.info(f"プロジェクト {project_id_str} の遅延状態: {has_delay}")
        
        # マイルストーン情報をフォーマット
        milestone_info = next_milestone_format(next_milestones, project_id_str)
        
        # Pydanticモデルに変換
        project = Project(
            project_id=project_id_str,  # 明示的に文字列に変換
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
            duration=int(row['duration']),
            next_milestone=milestone_info,
            has_delay=has_delay  # 明示的に遅延フラグを設定
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
        
        # project_idを文字列として扱う - 明示的な変換
        project_id_str = str(project_id)
        
        # project_idが数値型の場合に対応 - プロジェクトIDの型変換を明示的に実施
        df_with_str_id = df.copy()
        df_with_str_id['project_id'] = df_with_str_id['project_id'].astype(str)
        
        # プロジェクトの直近のタスク情報を取得 - 非同期版
        recent_tasks = await async_get_recent_tasks(df_with_str_id, project_id_str)
        
        return RecentTasks(**recent_tasks)
        
    except Exception as e:
        logger.error(f"直近タスク情報の取得に失敗しました: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"直近タスク情報の取得に失敗しました: {str(e)}")