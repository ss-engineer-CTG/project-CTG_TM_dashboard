"""
プロジェクト管理データの処理モジュール
- データの読み込みと処理
- 進捗計算
- 遅延検出
- マイルストーン関連処理
"""

import os
import pandas as pd
import datetime
import logging
import functools
import time
from typing import Optional, Dict, Any, List
import traceback
from pathlib import Path
import concurrent.futures

# ロガー設定
logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# インメモリキャッシュ - TTLと容量制限つき
_data_cache = {}
_cache_stats = {'hits': 0, 'misses': 0}
_MAX_CACHE_ENTRIES = 50

# デフォルトカラー定義（参考用）
COLORS = {
    'status': {
        'success': '#50ff96',
        'warning': '#ffeb45',
        'danger': '#ff5f5f',
        'info': '#60cdff',
        'neutral': '#c8c8c8'
    }
}

def cache_result(ttl_seconds: int = 300, max_entries: int = _MAX_CACHE_ENTRIES):
    """関数の結果をキャッシュするデコレータ - 最適化版"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # キャッシュキー作成 - 高速化
            key_parts = [func.__name__]
            for arg in args:
                if isinstance(arg, (str, int, float, bool)):
                    key_parts.append(str(arg))
            
            # 重要な引数のみキャッシュキーに含める
            file_path = kwargs.get('dashboard_file_path')
            if file_path:
                key_parts.append(str(file_path))
                
            cache_key = ":".join(key_parts)
            
            # キャッシュチェック
            if cache_key in _data_cache:
                data, timestamp = _data_cache[cache_key]
                age = time.time() - timestamp
                if age < ttl_seconds:
                    _cache_stats['hits'] += 1
                    return data
            
            # キャッシュミス時は関数実行
            _cache_stats['misses'] += 1
            result = func(*args, **kwargs)
            
            # キャッシュサイズ管理 - 容量超過時は古いデータを削除
            if len(_data_cache) >= max_entries:
                # 最も古いエントリを削除
                oldest_key = min(_data_cache.items(), key=lambda x: x[1][1])[0]
                del _data_cache[oldest_key]
            
            _data_cache[cache_key] = (result, time.time())
            return result
        return wrapper
    return decorator

def resolve_dashboard_path() -> str:
    """
    環境に応じたダッシュボードデータパスを解決
    
    Returns:
        解決されたパス
    """
    # 検索するパスのリスト
    search_paths = []
    
    # 1. 環境変数から直接取得 - 最優先
    if 'PMSUITE_DASHBOARD_FILE' in os.environ and os.environ['PMSUITE_DASHBOARD_FILE'].strip():
        dashboard_path = os.environ['PMSUITE_DASHBOARD_FILE']
        
        # 絶対パスに変換して存在確認
        dashboard_path = str(Path(dashboard_path).resolve())
        if os.path.exists(dashboard_path):
            return dashboard_path
        search_paths.append(dashboard_path)
    
    # 2. アプリケーションバンドルパスを試行
    app_path = os.environ.get('APP_PATH', '')
    if app_path:
        bundle_path = Path(app_path) / "data" / "exports" / "dashboard.csv"
        if bundle_path.exists():
            return str(bundle_path)
        search_paths.append(str(bundle_path))
    
    # 3. 現在の作業ディレクトリからの相対パスを試行
    current_dir = Path(os.getcwd()).resolve()
    
    # 様々な候補を試す
    fallback_paths = [
        current_dir / "data" / "exports" / "dashboard.csv",
        current_dir.parent / "data" / "exports" / "dashboard.csv",
        current_dir / "ProjectManager" / "data" / "exports" / "dashboard.csv",
        # このスクリプトからの相対パス
        Path(__file__).resolve().parents[3] / "data" / "exports" / "dashboard.csv",
        # さらに上の階層も試す
        Path(__file__).resolve().parents[4] / "data" / "exports" / "dashboard.csv",
    ]
    
    # アプリケーションディレクトリからの絶対パスも試す
    search_paths.extend([str(path) for path in fallback_paths])
    
    # 重複を削除
    search_paths = list(dict.fromkeys(filter(None, search_paths)))
    
    # パスを並列で検索
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(search_paths), 10)) as executor:
        def check_path(path):
            if os.path.exists(path):
                return path
            return None
        
        results = list(executor.map(check_path, search_paths))
    
    for result in results:
        if result:
            return result
    
    # 4. サンプルデータを提供
    logger.warning(f"ダッシュボードファイルが見つかりません。サンプルデータを返します。")
    
    # サンプルデータを生成してCSVを作成
    try:
        # 一時ディレクトリを作成して、そこにサンプルデータを保存
        temp_dir = Path(os.environ.get('TEMP', '/tmp')) / "project_dashboard"
        os.makedirs(temp_dir, exist_ok=True)
        
        sample_path = temp_dir / "sample_dashboard.csv"
        
        # サンプルデータフレームを作成
        sample_data = pd.DataFrame({
            'project_id': ['P001', 'P001', 'P002', 'P002', 'P002'],
            'project_name': ['サンプルプロジェクト1', 'サンプルプロジェクト1', 'サンプルプロジェクト2', 'サンプルプロジェクト2', 'サンプルプロジェクト2'],
            'process': ['設計', '設計', '開発', '開発', '開発'],
            'line': ['A', 'A', 'B', 'B', 'B'],
            'task_id': ['T001', 'T002', 'T003', 'T004', 'T005'],
            'task_name': ['要件定義', '基本設計', 'コーディング', 'テスト', 'リリース'],
            'task_status': ['完了', '完了', '完了', '進行中', '未着手'],
            'task_milestone': ['○', '', '○', '', '○'],
            'task_start_date': [
                (datetime.datetime.now() - datetime.timedelta(days=30)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=20)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=15)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=5)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() + datetime.timedelta(days=10)).strftime('%Y-%m-%d')
            ],
            'task_finish_date': [
                (datetime.datetime.now() - datetime.timedelta(days=25)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=10)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=5)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() + datetime.timedelta(days=5)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() + datetime.timedelta(days=20)).strftime('%Y-%m-%d')
            ],
            'created_at': [
                (datetime.datetime.now() - datetime.timedelta(days=40)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=40)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=30)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=30)).strftime('%Y-%m-%d'),
                (datetime.datetime.now() - datetime.timedelta(days=30)).strftime('%Y-%m-%d')
            ]
        })
        
        # サンプルCSVを保存
        sample_data.to_csv(sample_path, index=False, encoding='utf-8-sig')
        
        # プロジェクトデータも作成
        sample_projects = pd.DataFrame({
            'project_id': ['P001', 'P002'],
            'project_path': [str(temp_dir), str(temp_dir)],
            'ganttchart_path': [str(sample_path), str(sample_path)]
        })
        
        # プロジェクトCSVを保存
        projects_path = temp_dir / "sample_projects.csv"
        sample_projects.to_csv(projects_path, index=False, encoding='utf-8-sig')
        
        return str(sample_path)
    except Exception as e:
        logger.error(f"サンプルデータ作成エラー: {str(e)}")
        traceback.print_exc()
        
        # 最終的には最初のパスを返す（存在しなくても）
        return str(fallback_paths[0])  # 最初のパスを返す

@cache_result(ttl_seconds=60)  # 60秒キャッシュ
def load_and_process_data(dashboard_file_path: Optional[str] = None) -> pd.DataFrame:
    """
    データの読み込みと処理 - 最適化版
    
    Args:
        dashboard_file_path: ダッシュボードCSVファイルパス
        
    Returns:
        処理済みのデータフレーム
    """
    try:
        # パスが指定されていない場合はデフォルトパスを使用
        if not dashboard_file_path:
            dashboard_file_path = resolve_dashboard_path()
            
        # パス解決の二重確認
        dashboard_path = Path(dashboard_file_path).resolve()
        
        # ファイル存在確認
        if not dashboard_path.exists():
            logger.error(f"ファイルが見つかりません: {dashboard_path}")
            
            # 代替パスを探索
            alt_paths = [
                Path(os.environ.get("PMSUITE_DASHBOARD_FILE", "")),
                Path(os.environ.get("PMSUITE_DASHBOARD_DATA_DIR", "")) / "dashboard.csv",
                Path(os.getcwd()) / "data" / "exports" / "dashboard.csv",
                Path(os.getcwd()).parent / "data" / "exports" / "dashboard.csv"
            ]
            
            for alt_path in alt_paths:
                if alt_path.exists():
                    logger.info(f"代替パスが見つかりました: {alt_path}")
                    dashboard_path = alt_path
                    break
            else:
                # 代替パスが見つからなかった場合
                error_df = pd.DataFrame({
                    "error_message": [f"データファイルが見つかりません: {dashboard_path}"],
                    "additional_info": ["以下のパスも確認しましたが見つかりませんでした:"] + 
                                      [f"- {p}" for p in alt_paths if str(p) != "."]
                })
                return error_df
        
        # ファイルの読み込み - 並列エンコーディング試行
        df = None
        encoding_results = {}
        
        # 効率的なエンコーディング検出
        encodings = ['utf-8-sig', 'utf-8', 'cp932', 'shift-jis']
        
        # 並列でエンコーディングを試行
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(encodings)) as executor:
            def try_encoding(encoding):
                try:
                    return encoding, pd.read_csv(dashboard_path, encoding=encoding)
                except Exception as e:
                    return encoding, str(e)
            
            # 並列で試行
            encoding_results = dict(executor.map(lambda enc: try_encoding(enc), encodings))
        
        # 結果を処理
        for encoding, result in encoding_results.items():
            if isinstance(result, pd.DataFrame):
                df = result
                break
        
        if df is None:
            errors = [f"{enc}: {err}" for enc, err in encoding_results.items() if isinstance(err, str)]
            logger.error(f"すべてのエンコーディングで読み込みに失敗: {errors}")
            return pd.DataFrame({
                "error": ["CSVファイルの読み込みに失敗しました。以下のエンコーディングを試しましたが失敗しました:"],
                "details": ["\n".join(errors)]
            })
        
        # 成功したらプロジェクトデータも読み込み
        projects_file_path = str(dashboard_path).replace('dashboard.csv', 'projects.csv')
        
        if not os.path.exists(projects_file_path):
            # ダッシュボードデータのみ返す
            return df
            
        # プロジェクトデータの読み込み
        try:
            # 成功したエンコーディングを使用
            try:
                for encoding in encodings:
                    if isinstance(encoding_results.get(encoding), pd.DataFrame):
                        break
            except:
                encoding = 'utf-8-sig'  # フォールバック
            
            projects_df = pd.read_csv(projects_file_path, encoding=encoding)
            
            # データの結合
            df = pd.merge(
                df,
                projects_df[['project_id', 'project_path', 'ganttchart_path']],
                on='project_id',
                how='left'
            )
        except Exception as e:
            logger.warning(f"プロジェクトデータの読み込みエラー: {e}")
        
        # 日付列の処理
        date_columns = ['task_start_date', 'task_finish_date', 'created_at']
        for col in date_columns:
            if col in df.columns:
                try:
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                except Exception as e:
                    logger.warning(f"{col}列の日付変換エラー: {e}")
        
        return df
        
    except Exception as e:
        logger.error(f"データ読み込み総合エラー: {e}")
        return pd.DataFrame({"error": [f"データ読み込み処理中にエラーが発生しました: {str(e)}"]})

def check_delays(df: pd.DataFrame) -> pd.DataFrame:
    """
    遅延タスクの検出
    
    Args:
        df: データフレーム
        
    Returns:
        遅延タスクのデータフレーム
    """
    current_date = datetime.datetime.now()
    return df[
        (df['task_finish_date'] < current_date) & 
        (df['task_status'] != '完了')
    ]

@cache_result(ttl_seconds=60)  # 1分キャッシュ
def get_delayed_projects_count(df: pd.DataFrame) -> int:
    """
    遅延プロジェクト数を計算
    遅延タスクを持つプロジェクトの数を返す
    
    Args:
        df: データフレーム
        
    Returns:
        遅延プロジェクト数
    """
    delayed_tasks = check_delays(df)
    return len(delayed_tasks['project_id'].unique())

@cache_result(ttl_seconds=60)  # 1分キャッシュ
def calculate_progress(df: pd.DataFrame) -> pd.DataFrame:
    """
    プロジェクト進捗の計算 - パフォーマンス最適化版
    
    Args:
        df: データフレーム
        
    Returns:
        プロジェクト進捗のデータフレーム
    """
    try:
        # 空のデータフレームまたはエラーメッセージを含むデータフレームのチェック
        if df.empty:
            logger.warning("空のデータフレームでの進捗計算が試行されました")
            return pd.DataFrame(columns=[
                'project_id', 'project_name', 'process', 'line',
                'total_tasks', 'completed_tasks', 'milestone_count',
                'start_date', 'end_date', 'project_path', 'ganttchart_path',
                'progress', 'duration'
            ])
        
        if 'error' in df.columns:
            logger.warning("エラーメッセージを含むデータフレームでの進捗計算が試行されました")
            # エラーデータフレームから最小限の進捗データフレームを生成
            return pd.DataFrame({
                'project_id': [0],
                'project_name': ['エラー'],
                'process': ['N/A'],
                'line': ['N/A'],
                'total_tasks': [0],
                'completed_tasks': [0],
                'milestone_count': [0],
                'start_date': [datetime.datetime.now()],
                'end_date': [datetime.datetime.now()],
                'project_path': [''],
                'ganttchart_path': [''],
                'progress': [0],
                'duration': [0]
            })
        
        # 必要なカラムの存在確認 - 最適化: 一度に確認
        required_columns = ['project_id', 'project_name', 'task_id', 'task_status', 
                           'task_start_date', 'task_finish_date']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            logger.error(f"進捗計算に必要なカラムがありません: {missing_columns}")
            return pd.DataFrame({
                'project_id': [0],
                'project_name': ['データエラー'],
                'process': ['N/A'],
                'line': ['N/A'],
                'total_tasks': [0],
                'completed_tasks': [0],
                'milestone_count': [0],
                'start_date': [datetime.datetime.now()],
                'end_date': [datetime.datetime.now()],
                'project_path': [''],
                'ganttchart_path': [''],
                'progress': [0],
                'duration': [0]
            })
        
        # 最適化: 並列処理でプロジェクトごとの集計を高速化
        project_ids = df['project_id'].unique()
        
        # マルチスレッド処理を部分適用（プロジェクト数が多い場合のみ）
        if len(project_ids) > 10:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(project_ids), 20)) as executor:
                def process_project(project_id):
                    try:
                        project_df = df[df['project_id'] == project_id]
                        
                        return {
                            'project_id': project_id,
                            'project_name': project_df['project_name'].iloc[0] if not project_df.empty else 'Unknown',
                            'process': project_df['process'].iloc[0] if 'process' in project_df.columns and not project_df.empty else '',
                            'line': project_df['line'].iloc[0] if 'line' in project_df.columns and not project_df.empty else '',
                            'total_tasks': len(project_df),
                            'completed_tasks': (project_df['task_status'] == '完了').sum(),
                            'milestone_count': project_df['task_milestone'].str.contains('○', na=False).sum() if 'task_milestone' in project_df.columns else 0,
                            'start_date': project_df['task_start_date'].min(),
                            'end_date': project_df['task_finish_date'].max(),
                            'project_path': project_df['project_path'].iloc[0] if 'project_path' in project_df.columns and not project_df.empty else None,
                            'ganttchart_path': project_df['ganttchart_path'].iloc[0] if 'ganttchart_path' in project_df.columns and not project_df.empty else None,
                        }
                    except Exception as e:
                        logger.error(f"プロジェクト {project_id} の処理中にエラー: {e}")
                        return None
                
                # 並列処理を実行
                results = list(executor.map(process_project, project_ids))
                
                # Noneを除外
                valid_results = [r for r in results if r is not None]
                
                # DataFrameに変換
                project_progress = pd.DataFrame(valid_results)
        else:
            # プロジェクト数が少ない場合はpandasの通常処理を使用
            # 先にプロジェクトごとにグループ化
            project_groups = df.groupby('project_id')
            
            # マイルストーン数の計算を高速化
            if 'task_milestone' in df.columns:
                milestone_counts = project_groups['task_milestone'].apply(
                    lambda x: x.str.contains('○', na=False).sum()
                )
            else:
                milestone_counts = pd.Series(0, index=project_ids)
            
            # 完了タスク数の計算
            completed_counts = project_groups['task_status'].apply(
                lambda x: (x == '完了').sum()
            )
            
            # 集計処理
            agg_funcs = {
                'project_name': 'first',
                'task_id': 'count',
            }
            
            # 必要なカラムのみ追加
            if 'process' in df.columns:
                agg_funcs['process'] = 'first'
            if 'line' in df.columns:
                agg_funcs['line'] = 'first'
            if 'project_path' in df.columns:
                agg_funcs['project_path'] = 'first'
            if 'ganttchart_path' in df.columns:
                agg_funcs['ganttchart_path'] = 'first'
            
            project_progress = project_groups.agg(agg_funcs).reset_index()
            
            # 集計結果にマイルストーン数と完了タスク数を追加
            project_progress['milestone_count'] = project_progress['project_id'].map(milestone_counts)
            project_progress['completed_tasks'] = project_progress['project_id'].map(completed_counts)
            project_progress['total_tasks'] = project_progress['task_id']
            
            # 開始日と終了日の取得
            start_dates = project_groups['task_start_date'].min()
            end_dates = project_groups['task_finish_date'].max()
            
            project_progress['start_date'] = project_progress['project_id'].map(start_dates)
            project_progress['end_date'] = project_progress['project_id'].map(end_dates)
        
        # 進捗率と期間の計算
        project_progress['progress'] = (project_progress['completed_tasks'] / 
                                      project_progress['total_tasks'] * 100).round(2)
        
        # 欠損値対策
        project_progress['progress'] = project_progress['progress'].fillna(0)
        
        # 期間計算 - 異常値対策
        try:
            project_progress['duration'] = (project_progress['end_date'] - 
                                        project_progress['start_date']).dt.days
            project_progress['duration'] = project_progress['duration'].fillna(0).astype(int)
        except:
            # どうしても計算できない場合は0を設定
            project_progress['duration'] = 0
        
        # 必須カラムが含まれていることを確認
        required_result_cols = [
            'project_id', 'project_name', 'total_tasks', 'completed_tasks', 
            'milestone_count', 'start_date', 'end_date', 'progress', 'duration'
        ]
        
        for col in required_result_cols:
            if col not in project_progress.columns:
                if col in ['process', 'line']:
                    project_progress[col] = ''
                elif col in ['project_path', 'ganttchart_path']:
                    project_progress[col] = None
                else:
                    project_progress[col] = 0
        
        return project_progress
    except Exception as e:
        logger.error(f"進捗計算エラー: {str(e)}")
        # 最小限のデータフレームを返す
        return pd.DataFrame({
            'project_id': [0],
            'project_name': ['計算エラー'],
            'process': ['N/A'],
            'line': ['N/A'],
            'total_tasks': [0],
            'completed_tasks': [0],
            'milestone_count': [0],
            'start_date': [datetime.datetime.now()],
            'end_date': [datetime.datetime.now()],
            'project_path': [''],
            'ganttchart_path': [''],
            'progress': [0],
            'duration': [0]
        })

def get_status_color(progress: float, has_delay: bool) -> str:
    """
    進捗状況に応じた色を返す
    
    Args:
        progress: 進捗率
        has_delay: 遅延フラグ
        
    Returns:
        色コード
    """
    if has_delay:
        return COLORS['status']['danger']
    elif progress >= 90:
        return COLORS['status']['success']
    elif progress >= 70:
        return COLORS['status']['info']
    elif progress >= 50:
        return COLORS['status']['warning']
    return COLORS['status']['neutral']

@cache_result(ttl_seconds=60)  # 1分キャッシュ
def get_next_milestone(df: pd.DataFrame) -> pd.DataFrame:
    """
    次のマイルストーンを取得
    
    Args:
        df: データフレーム
        
    Returns:
        次のマイルストーンのデータフレーム
    """
    current_date = datetime.datetime.now()
    return df[
        (df['task_milestone'] == '○') & 
        (df['task_finish_date'] > current_date)
    ].sort_values('task_finish_date')

def next_milestone_format(next_milestones: pd.DataFrame, project_id: str) -> str:
    """
    マイルストーン表示のフォーマット
    
    Args:
        next_milestones: マイルストーンのデータフレーム
        project_id: プロジェクトID
        
    Returns:
        フォーマット済みのマイルストーン文字列
    """
    milestone = next_milestones[next_milestones['project_id'] == project_id]
    if len(milestone) == 0:
        return '-'
    next_date = milestone.iloc[0]['task_finish_date']
    days_until = (next_date - datetime.datetime.now()).days
    return f"{milestone.iloc[0]['task_name']} ({days_until}日後)"

@cache_result(ttl_seconds=30)  # 30秒キャッシュ
def get_recent_tasks(df: pd.DataFrame, project_id: str) -> Dict[str, Any]:
    """
    プロジェクトの直近のタスク情報を取得する - 最適化版
    
    Args:
        df: データフレーム
        project_id: プロジェクトID
        
    Returns:
        直近のタスク情報を含む辞書
    """
    try:
        current_date = datetime.datetime.now()
        
        # project_idが文字列型でない場合は変換
        if not isinstance(project_id, str):
            project_id = str(project_id)
            
        # マスク処理による高速化
        project_tasks = df[df['project_id'].astype(str) == project_id]
        
        if project_tasks.empty:
            return {
                'delayed': None,
                'in_progress': None,
                'next_task': None,
                'next_next_task': None
            }
        
        # 遅延中タスク - boolean マスクを使用した高速フィルタリング
        delay_mask = ((project_tasks['task_finish_date'] < current_date) & 
                     (project_tasks['task_status'] != '完了'))
        delayed_tasks = project_tasks[delay_mask].sort_values('task_finish_date')
        
        # 進行中タスク
        progress_mask = ((project_tasks['task_status'] != '完了') & 
                        (project_tasks['task_start_date'] <= current_date) &
                        (project_tasks['task_finish_date'] >= current_date))
        in_progress_tasks = project_tasks[progress_mask].sort_values('task_finish_date')
        
        # 次のタスク
        next_mask = ((project_tasks['task_status'] != '完了') & 
                    (project_tasks['task_start_date'] > current_date))
        next_tasks = project_tasks[next_mask].sort_values('task_start_date')
        
        # 結果の作成 - 高速化のためにlen()を使用
        result = {}
        
        # 遅延中タスク
        if len(delayed_tasks) > 0:
            result['delayed'] = {
                'name': delayed_tasks.iloc[0]['task_name'],
                'days_delayed': (current_date - delayed_tasks.iloc[0]['task_finish_date']).days
            }
        else:
            result['delayed'] = None
        
        # 進行中タスク
        if len(in_progress_tasks) > 0:
            result['in_progress'] = {
                'name': in_progress_tasks.iloc[0]['task_name'],
                'days_remaining': (in_progress_tasks.iloc[0]['task_finish_date'] - current_date).days
            }
        else:
            result['in_progress'] = None
        
        # 次のタスク
        if len(next_tasks) > 0:
            result['next_task'] = {
                'name': next_tasks.iloc[0]['task_name'],
                'days_until': (next_tasks.iloc[0]['task_start_date'] - current_date).days
            }
        else:
            result['next_task'] = None
        
        # 次の次のタスク
        if len(next_tasks) > 1:
            result['next_next_task'] = {
                'name': next_tasks.iloc[1]['task_name'],
                'days_until': (next_tasks.iloc[1]['task_start_date'] - current_date).days
            }
        else:
            result['next_next_task'] = None
        
        return result
        
    except Exception as e:
        logger.error(f"プロジェクト {project_id} の直近タスク取得エラー: {str(e)}")
        return {
            'delayed': None,
            'in_progress': None,
            'next_task': None,
            'next_next_task': None
        }

# キャッシュをクリアする関数
def clear_cache():
    """メモリキャッシュをクリアする"""
    global _data_cache
    cache_size = len(_data_cache)
    _data_cache = {}
    logger.info(f"キャッシュをクリア: {cache_size}項目を削除しました")
    return cache_size

# キャッシュ統計情報を取得
def get_cache_stats():
    """キャッシュの統計情報を取得"""
    return {
        'items': len(_data_cache),
        'hits': _cache_stats['hits'],
        'misses': _cache_stats['misses'],
        'hit_ratio': _cache_stats['hits'] / (_cache_stats['hits'] + _cache_stats['misses']) * 100 if (_cache_stats['hits'] + _cache_stats['misses']) > 0 else 0,
        'keys': list(_data_cache.keys())
    }