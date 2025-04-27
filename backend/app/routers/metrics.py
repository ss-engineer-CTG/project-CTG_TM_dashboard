from fastapi import APIRouter, HTTPException, Query
import logging

from app.models.schemas import DashboardMetrics, ProjectSummary, ProgressDistribution, DurationDistribution
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
        
        # 進捗分布
        progress_ranges = ['0-25%', '26-50%', '51-75%', '76-99%', '100%']
        progress_counts = [
            len(progress_data[progress_data['progress'] <= 25]),
            len(progress_data[(progress_data['progress'] > 25) & (progress_data['progress'] <= 50)]),
            len(progress_data[(progress_data['progress'] > 50) & (progress_data['progress'] <= 75)]),
            len(progress_data[(progress_data['progress'] > 75) & (progress_data['progress'] < 100)]),
            len(progress_data[progress_data['progress'] == 100])
        ]
        
        # 期間分布
        duration_ranges = ['1ヶ月以内', '1-3ヶ月', '3-6ヶ月', '6-12ヶ月', '12ヶ月以上']
        duration_counts = [
            len(progress_data[progress_data['duration'] <= 30]),
            len(progress_data[(progress_data['duration'] > 30) & (progress_data['duration'] <= 90)]),
            len(progress_data[(progress_data['duration'] > 90) & (progress_data['duration'] <= 180)]),
            len(progress_data[(progress_data['duration'] > 180) & (progress_data['duration'] <= 365)]),
            len(progress_data[progress_data['duration'] > 365])
        ]
        
        # レスポンスの構築
        metrics = DashboardMetrics(
            summary=ProjectSummary(
                total_projects=total_projects,
                active_projects=active_projects,
                delayed_projects=delayed_projects,
                milestone_projects=milestone_projects
            ),
            progress_distribution=ProgressDistribution(
                ranges=progress_ranges,
                counts=progress_counts
            ),
            duration_distribution=DurationDistribution(
                ranges=duration_ranges,
                counts=duration_counts
            ),
            last_updated=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )
        
        return metrics
        
    except Exception as e:
        logger.error(f"メトリクス取得エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"メトリクスの取得に失敗しました: {str(e)}")