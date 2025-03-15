from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import os
import logging
import datetime
import json
import subprocess
import platform
from pathlib import Path

# 既存のデータ処理モジュールからの処理ロジックのインポート
from models.project_dashboard import (
    load_and_process_data, 
    calculate_progress, 
    check_delays, 
    get_delayed_projects_count,
    get_next_milestone
)

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename=os.path.join('logs', 'api.log')
)
logger = logging.getLogger(__name__)

# ログディレクトリの作成
os.makedirs('logs', exist_ok=True)

app = FastAPI(
    title="プロジェクト管理ダッシュボード API",
    description="プロジェクト進捗データを提供するRESTful API",
    version="1.0.0"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.jsの開発サーバーのデフォルトポート
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# データモデル
class ProjectSummary(BaseModel):
    total_projects: int
    active_projects: int
    delayed_projects: int
    milestone_projects: int
    update_time: str

class FileInfo(BaseModel):
    path: str

class FileOpenResult(BaseModel):
    success: bool
    message: str

# ダッシュボードのデータパス取得関数（既存のコードから移植）
def resolve_dashboard_path() -> str:
    """環境に応じたダッシュボードデータパスを解決"""
    logger.info("ダッシュボードデータパスの解決を開始")
    
    # 環境変数から直接取得
    if 'PMSUITE_DASHBOARD_FILE' in os.environ:
        dashboard_path = os.environ['PMSUITE_DASHBOARD_FILE']
        if Path(dashboard_path).exists():
            return str(Path(dashboard_path).resolve())
    
    # フォールバックパス
    fallback_paths = [
        Path(os.getcwd()) / "data" / "exports" / "dashboard.csv",
        Path(os.getcwd()).parent / "data" / "exports" / "dashboard.csv",
        Path(os.getcwd()) / "ProjectManager" / "data" / "exports" / "dashboard.csv"
    ]
    
    for path in fallback_paths:
        if path.exists():
            return str(path)
    
    return "dashboard.csv"  # 最終フォールバック

# ファイル操作関数
def open_file_or_folder(path: str, allow_directories: bool = True) -> Dict[str, Any]:
    """ファイルまたはフォルダを開く"""
    try:
        logger.info(f"Attempting to open path: {path}")
        
        if not path or not os.path.exists(path):
            return {
                'success': False,
                'message': '指定されたパスが存在しません'
            }
        
        # ディレクトリチェック
        if os.path.isdir(path) and not allow_directories:
            return {
                'success': False,
                'message': 'ディレクトリは許可されていません'
            }
        
        system = platform.system()
        
        if system == 'Windows':
            os.startfile(path)
        elif system == 'Darwin':  # macOS
            subprocess.run(['open', path], check=True)
        elif system == 'Linux':
            subprocess.run(['xdg-open', path], check=True)
        else:
            return {
                'success': False,
                'message': f'サポートされていないOS: {system}'
            }
        
        return {
            'success': True,
            'message': 'ファイルを正常に開きました'
        }
        
    except Exception as e:
        logger.error(f"Error opening file: {str(e)}")
        return {
            'success': False,
            'message': f'エラー: {str(e)}'
        }

# APIエンドポイント
@app.get("/")
def read_root():
    return {"message": "プロジェクト管理ダッシュボード API"}

@app.get("/api/dashboard-file")
def get_dashboard_file_path():
    """デフォルトのダッシュボードファイルパスを取得"""
    path = resolve_dashboard_path()
    return {"path": path, "exists": os.path.exists(path)}

@app.post("/api/load-data")
def load_data(file_info: FileInfo):
    """指定されたCSVファイルからデータを読み込む"""
    try:
        file_path = file_info.path
        if not os.path.exists(file_path):
            file_path = resolve_dashboard_path()
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="ダッシュボードファイルが見つかりません")
        
        df = load_and_process_data(file_path)
        progress_data = calculate_progress(df)
        
        # 統計の計算
        total_projects = len(progress_data)
        active_projects = len(progress_data[progress_data['progress'] < 100])
        delayed_projects = get_delayed_projects_count(df)
        
        # 今月のマイルストーン数
        milestone_projects = len(df[
            (df['task_milestone'] == '○') & 
            (df['task_finish_date'].dt.month == datetime.datetime.now().month)
        ]['project_id'].unique())
        
        # プロジェクトデータの整形
        projects = []
        next_milestones = get_next_milestone(df)
        delayed_tasks = check_delays(df)
        
        for _, row in progress_data.iterrows():
            project_id = row['project_id']
            has_delay = any(delayed_tasks['project_id'] == project_id)
            
            # 次のマイルストーン
            milestone_row = next_milestones[next_milestones['project_id'] == project_id]
            next_milestone = None
            if len(milestone_row) > 0:
                next_date = milestone_row.iloc[0]['task_finish_date']
                days_until = (next_date - datetime.datetime.now()).days
                next_milestone = {
                    "name": milestone_row.iloc[0]['task_name'],
                    "days_until": days_until,
                    "date": next_date.strftime('%Y-%m-%d')
                }
            
            # プロジェクトの直近タスク
            recent_tasks = {
                "delayed": [],
                "in_progress": [],
                "upcoming": []
            }
            
            # プロジェクトのタスク取得
            project_tasks = df[df['project_id'] == project_id]
            current_date = datetime.datetime.now()
            
            # 遅延中タスク
            delayed_project_tasks = project_tasks[
                (project_tasks['task_finish_date'] < current_date) & 
                (project_tasks['task_status'] != '完了')
            ].sort_values('task_finish_date')
            
            for _, task in delayed_project_tasks.iterrows():
                days_delay = (current_date - task['task_finish_date']).days
                recent_tasks["delayed"].append({
                    "id": task['task_id'],
                    "name": task['task_name'],
                    "days_delay": days_delay
                })
            
            # 進行中タスク
            in_progress_tasks = project_tasks[
                (project_tasks['task_status'] != '完了') & 
                (project_tasks['task_start_date'] <= current_date) &
                (project_tasks['task_finish_date'] >= current_date)
            ].sort_values('task_finish_date')
            
            for _, task in in_progress_tasks.iterrows():
                days_remaining = (task['task_finish_date'] - current_date).days
                recent_tasks["in_progress"].append({
                    "id": task['task_id'],
                    "name": task['task_name'],
                    "days_remaining": days_remaining
                })
            
            # 次のタスク
            next_tasks = project_tasks[
                (project_tasks['task_status'] != '完了') & 
                (project_tasks['task_start_date'] > current_date)
            ].sort_values('task_start_date')
            
            for _, task in next_tasks.iterrows():
                days_to_start = (task['task_start_date'] - current_date).days
                recent_tasks["upcoming"].append({
                    "id": task['task_id'],
                    "name": task['task_name'],
                    "days_to_start": days_to_start
                })
            
            # プロジェクト情報
            project = {
                "id": row['project_id'],
                "name": row['project_name'],
                "process": row['process'],
                "line": row['line'],
                "progress": row['progress'],
                "has_delay": has_delay,
                "status": '遅延あり' if has_delay else '進行中' if row['progress'] < 100 else '完了',
                "next_milestone": next_milestone,
                "task_progress": {
                    "completed": row['completed_tasks'],
                    "total": row['total_tasks']
                },
                "recent_tasks": recent_tasks,
                "paths": {
                    "project_path": row['project_path'],
                    "ganttchart_path": row['ganttchart_path']
                },
                "duration": row['duration']
            }
            
            projects.append(project)
        
        # 進捗分布データの計算
        progress_ranges = ['0-25%', '26-50%', '51-75%', '76-99%', '100%']
        progress_counts = [
            len(progress_data[progress_data['progress'] <= 25]),
            len(progress_data[(progress_data['progress'] > 25) & (progress_data['progress'] <= 50)]),
            len(progress_data[(progress_data['progress'] > 50) & (progress_data['progress'] <= 75)]),
            len(progress_data[(progress_data['progress'] > 75) & (progress_data['progress'] < 100)]),
            len(progress_data[progress_data['progress'] == 100])
        ]
        
        # 期間分布データの計算
        duration_ranges = ['1ヶ月以内', '1-3ヶ月', '3-6ヶ月', '6-12ヶ月', '12ヶ月以上']
        duration_counts = [
            len(progress_data[progress_data['duration'] <= 30]),
            len(progress_data[(progress_data['duration'] > 30) & (progress_data['duration'] <= 90)]),
            len(progress_data[(progress_data['duration'] > 90) & (progress_data['duration'] <= 180)]),
            len(progress_data[(progress_data['duration'] > 180) & (progress_data['duration'] <= 365)]),
            len(progress_data[progress_data['duration'] > 365])
        ]
        
        return {
            "summary": {
                "total_projects": total_projects,
                "active_projects": active_projects,
                "delayed_projects": delayed_projects,
                "milestone_projects": milestone_projects,
                "update_time": datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            },
            "projects": projects,
            "charts": {
                "progress_distribution": {
                    "labels": progress_ranges,
                    "data": progress_counts
                },
                "duration_distribution": {
                    "labels": duration_ranges,
                    "data": duration_counts
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Error loading data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/open-file")
def open_file_api(file_info: FileInfo, allow_directories: bool = Query(True)):
    """ファイルまたはフォルダを開く"""
    try:
        result = open_file_or_folder(file_info.path, allow_directories)
        if not result['success']:
            raise HTTPException(status_code=400, detail=result['message'])
        return result
    except Exception as e:
        logger.error(f"Error opening file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 起動スクリプト
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)