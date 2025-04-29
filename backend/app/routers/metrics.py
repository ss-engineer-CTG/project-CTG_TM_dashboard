from fastapi import APIRouter, HTTPException, Query
import logging

from app.models.schemas import DashboardMetrics, ProjectSummary
from app.services.data_processing import (
    async_load_and_process_data, async_calculate_progress,
    get_delayed_projects_count
)
from app.services.async_loader import lazy_import

router = APIRouter()
logger = logging.getLogger("api.metrics")

@router.get("/metrics", response_model=DashboardMetrics)
async def get_metrics(file_path: str = Query(None)):
    """
    ダッシュボードのメトリクスを取得する
    
    Args:
        file_path: ダッシュボードCSVファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        ダッシュボードメトリクス
    """
    try:
        # datetime と pandas を遅延インポート
        datetime = lazy_import("datetime")
        
        # データの読み込みと処理 - 非同期版
        df = await async_load_and_process_data(file_path)
        
        # プロジェクト進捗の計算 - 非同期版
        progress_data = await async_calculate_progress(df)
        
        # 統計の計算
        total_projects = len(progress_data)
        active_projects = len(progress_data[progress_data['progress'] < 100])
        delayed_projects = get_delayed_projects_count(df)
        
        # 当月のマイルストーンプロジェクト数を計算
        current_month = datetime.datetime.now().month
        milestone_projects = len(df[
            (df['task_milestone'] == '○') & 
            (df['task_finish_date'].dt.month == current_month)
        ]['project_id'].unique())
        
        # レスポンスの構築 - チャート関連のデータを削除
        metrics = DashboardMetrics(
            summary=ProjectSummary(
                total_projects=total_projects,
                active_projects=active_projects,
                delayed_projects=delayed_projects,
                milestone_projects=milestone_projects
            ),
            last_updated=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )
        
        return metrics
        
    except Exception as e:
        logger.error(f"メトリクス取得エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"メトリクスの取得に失敗しました: {str(e)}")