from fastapi import APIRouter, HTTPException, Query
import datetime

from app.models.schemas import DashboardMetrics, ProjectSummary, ProgressDistribution, DurationDistribution
from app.services.data_processing import (
    load_and_process_data, calculate_progress, 
    get_delayed_projects_count
)

router = APIRouter()

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
        # データの読み込みと処理
        df = load_and_process_data(file_path)
        
        # プロジェクト進捗の計算
        progress_data = calculate_progress(df)
        
        # 統計の計算
        total_projects = len(progress_data)
        active_projects = len(progress_data[progress_data['progress'] < 100])
        delayed_projects = get_delayed_projects_count(df)
        milestone_projects = len(df[
            (df['task_milestone'] == '○') & 
            (df['task_finish_date'].dt.month == datetime.datetime.now().month)
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
        raise HTTPException(status_code=500, detail=f"メトリクスの取得に失敗しました: {str(e)}")