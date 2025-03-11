"""
ダッシュボードのコールバック処理

- ダッシュボード更新処理
- ファイル操作コールバック
"""

import datetime
import logging
import plotly.graph_objects as go
from dash import html, Output, Input, State, ALL, callback_context
from dash.exceptions import PreventUpdate
import os
import sys
from pathlib import Path

from ProjectDashBoard.config import COLORS, STYLES
from ProjectDashBoard.data_processing import (
    load_and_process_data, calculate_progress, 
    get_delayed_projects_count
)
from ProjectDashBoard.ui_components import (
    create_project_table, create_progress_distribution, create_duration_distribution
)
from ProjectDashBoard.file_utils import open_file_or_folder

logger = logging.getLogger(__name__)

# ★★★ 追加: パス解決機能 ★★★
def resolve_dashboard_path():
    """環境に応じたダッシュボードデータパスを解決"""
    logger.info("ダッシュボードデータパスの解決を開始")
    
    # ログに詳細なパス情報を出力
    logger.info(f"作業ディレクトリ: {os.getcwd()}")
    logger.info(f"環境変数: PMSUITE_DASHBOARD_FILE={os.environ.get('PMSUITE_DASHBOARD_FILE', '未設定')}")
    
    # 1. 環境変数から直接取得
    if 'PMSUITE_DASHBOARD_FILE' in os.environ:
        dashboard_path = os.environ['PMSUITE_DASHBOARD_FILE']
        logger.info(f"環境変数からファイルパスを取得: {dashboard_path}")
        
        # 絶対パスに変換して存在確認
        dashboard_path = str(Path(dashboard_path).resolve())
        if Path(dashboard_path).exists():
            logger.info(f"確認済みパス: {dashboard_path} (存在します)")
            return dashboard_path
        else:
            logger.warning(f"ファイルが存在しません: {dashboard_path}")
    
    # 2. PathRegistryから取得を試みる（絶対インポートを使用）
    try:
        import sys
        project_root = Path(__file__).parent.parent.parent
        if project_root not in sys.path:
            sys.path.insert(0, str(project_root))
        
        from PathRegistry import PathRegistry
        registry = PathRegistry.get_instance()
        
        # キーの優先順位で試行
        for key in ["DASHBOARD_FILE", "DASHBOARD_EXPORT_FILE", "PROJECTS_EXPORT_FILE"]:
            dashboard_path = registry.get_path(key)
            if dashboard_path and Path(dashboard_path).exists():
                logger.info(f"PathRegistryからパスを取得: {key} = {dashboard_path}")
                return str(dashboard_path)
    except Exception as e:
        logger.error(f"PathRegistry読み込みエラー: {e}")
    
    # 3. 固定のフォールバックパス
    fallback_paths = [
        Path(os.getcwd()) / "data" / "exports" / "dashboard.csv",
        Path(os.getcwd()).parent / "data" / "exports" / "dashboard.csv",
        Path(os.getcwd()) / "ProjectManager" / "data" / "exports" / "dashboard.csv"
    ]
    
    for path in fallback_paths:
        if path.exists():
            logger.info(f"フォールバックパスが見つかりました: {path}")
            return str(path)
    
    # 4. 最終フォールバック
    logger.error("すべてのパス解決方法が失敗しました")
    return "dashboard.csv"  # 相対パスとして最後の望み

# 重要: グローバル変数として明示的に定義
DASHBOARD_FILE_PATH = resolve_dashboard_path()

def register_callbacks(app):
    """
    アプリケーションにコールバックを登録する
    
    Args:
        app: Dashアプリケーションオブジェクト
    """
    
    # ★★★ 修正: 初回ロード時の自動更新コールバック - prevent_initial_call=True を追加 ★★★
    @app.callback(
        Output('update-button', 'n_clicks', allow_duplicate=True),
        [Input('initial-update-interval', 'n_intervals')],
        prevent_initial_call=True  # この行を追加
    )
    def auto_update_on_load(n_intervals):
        """
        アプリケーションロード時に自動的にダッシュボードを更新する
        
        Args:
            n_intervals: Intervalコンポーネントの発火回数
            
        Returns:
            新しいクリック回数 (1)
        """
        if n_intervals is None or n_intervals < 1:
            raise PreventUpdate
            
        logger.info("初回ロード時の自動更新を実行します")
        # 1クリックとして扱い、更新処理をトリガー
        return 1
    
    # ファイル選択ボタンのコールバック (新規追加)
    @app.callback(
        [Output('selected-file-path', 'data'),
         Output('selected-file-display', 'children')],
        [Input('select-file-button', 'n_clicks')],
        [State('selected-file-path', 'data')]
    )
    def select_dashboard_file(n_clicks, current_path):
        """
        ダッシュボードファイルの選択ダイアログを表示
        
        Args:
            n_clicks: ボタンのクリック回数
            current_path: 現在選択されているファイルパス
            
        Returns:
            選択されたファイルパスと表示用テキスト
        """
        ctx = callback_context
        
        # 初期表示時
        if not ctx.triggered:
            # 保存済みパスがあればそれを、なければデフォルトを使用
            path_to_use = current_path if current_path and Path(current_path).exists() else DASHBOARD_FILE_PATH
            return path_to_use, f"現在のファイル: {path_to_use}"
        
        if n_clicks is None or n_clicks == 0:
            raise PreventUpdate
        
        try:
            # tkinterを使用してファイル選択ダイアログを表示
            from tkinter import Tk, filedialog
            root = Tk()
            root.withdraw()  # ルートウィンドウを表示しない
            
            # デフォルトディレクトリを設定
            if current_path and Path(current_path).parent.exists():
                initialdir = str(Path(current_path).parent)
            else:
                initialdir = os.getcwd()
            
            # ファイル選択ダイアログを表示
            file_path = filedialog.askopenfilename(
                initialdir=initialdir,
                title="ダッシュボードCSVファイルの選択",
                filetypes=(("CSV files", "*.csv"), ("All files", "*.*"))
            )
            
            # キャンセルされた場合、現在のパスを維持
            if not file_path:
                return current_path, f"現在のファイル: {current_path}"
                
            # 選択されたファイルパスを返す
            return file_path, f"現在のファイル: {file_path}"
            
        except Exception as e:
            logger.error(f"ファイル選択エラー: {str(e)}")
            # エラー時は現在のパスを維持
            return current_path, f"現在のファイル: {current_path} (エラー: {str(e)})"
    
    # データ更新ボタンのコールバック (新規追加)
    @app.callback(
        Output('update-button', 'n_clicks'),
        [Input('refresh-data-button', 'n_clicks')],
        [State('update-button', 'n_clicks')]
    )
    def trigger_update(refresh_clicks, current_clicks):
        """
        データ更新ボタンがクリックされたときに隠しボタンのクリックをトリガー
        
        Args:
            refresh_clicks: 更新ボタンのクリック回数
            current_clicks: 現在の隠しボタンのクリック回数
            
        Returns:
            新しいクリック回数
        """
        if refresh_clicks is None or refresh_clicks == 0:
            raise PreventUpdate
            
        # データ更新ボタンがクリックされたら、隠しボタンのクリック数を増やして更新
        return (current_clicks or 0) + 1
    
    @app.callback(
        [Output('total-projects', 'children'),
        Output('active-projects', 'children'),
        Output('delayed-projects', 'children'),
        Output('milestone-projects', 'children'),
        Output('project-table', 'children'),
        Output('progress-distribution', 'figure'),
        Output('duration-distribution', 'figure'),
        Output('update-time', 'children')],
        [Input('update-button', 'n_clicks')],
        [State('selected-file-path', 'data')]  # 新たにselected-file-pathを受け取る
    )
    def update_dashboard(n_clicks, selected_file_path):
        """
        ダッシュボードの更新処理
        
        Args:
            n_clicks: 更新ボタンのクリック回数
            selected_file_path: 選択されたファイルパス
            
        Returns:
            更新された値のタプル
        """
        try:
            # 選択されたファイルパスがない場合はデフォルトを使用
            file_path = selected_file_path if selected_file_path else DASHBOARD_FILE_PATH
            
            # ファイルの存在確認
            if not Path(file_path).exists():
                logger.warning(f"選択されたファイルが存在しません: {file_path}, デフォルトを使用します")
                file_path = DASHBOARD_FILE_PATH
                
                # デフォルトも存在しない場合
                if not Path(DASHBOARD_FILE_PATH).exists():
                    logger.error(f"デフォルトファイルも存在しません: {DASHBOARD_FILE_PATH}")
                    return (
                        '0', '0', '0', '0',
                        html.Div([
                            html.P('データファイルが見つかりません', style={'color': COLORS['status']['danger']}),
                            html.P(f"パス: {file_path}", style={'color': COLORS['status']['danger'], 'fontSize': '0.8em'})
                        ]),
                        go.Figure(),
                        go.Figure(),
                        datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    )
            
            logger.info(f"更新処理: ファイルパス = {file_path}")
            
            # データの読み込みと処理
            df = load_and_process_data(file_path)
            progress_data = calculate_progress(df)
            
            # 統計の計算
            total_projects = len(progress_data)
            active_projects = len(progress_data[progress_data['progress'] < 100])
            delayed_projects = get_delayed_projects_count(df)
            milestone_projects = len(df[
                (df['task_milestone'] == '○') & 
                (df['task_finish_date'].dt.month == datetime.datetime.now().month)
            ]['project_id'].unique())
            
            # テーブルとグラフの生成
            table = create_project_table(df, progress_data)
            progress_fig = create_progress_distribution(progress_data)
            duration_fig = create_duration_distribution(progress_data)
            current_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            return (
                str(total_projects),
                str(active_projects),
                str(delayed_projects),
                str(milestone_projects),
                table,
                progress_fig,
                duration_fig,
                f'最終更新: {current_time}'
            )
        
        except Exception as e:
            logger.error(f"Error updating dashboard: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            # エラー時のフォールバック値を返す
            return (
                '0', '0', '0', '0',
                html.Div([
                    html.P('データの読み込みに失敗しました', style={'color': COLORS['status']['danger']}),
                    html.P(f"エラー: {str(e)}", style={'color': COLORS['status']['danger'], 'fontSize': '0.8em'})
                ]),
                go.Figure(),
                go.Figure(),
                datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            )

    @app.callback(
        [Output('dummy-output', 'children'),
        Output('notification-container', 'children')],
        [Input({'type': 'open-path-button', 'path': ALL, 'action': ALL}, 'n_clicks')],
        [State({'type': 'open-path-button', 'path': ALL, 'action': ALL}, 'id')]
    )
    def handle_button_click(n_clicks_list, button_ids):
        """
        ボタンクリックイベントの処理
        
        Args:
            n_clicks_list: クリック回数のリスト
            button_ids: ボタンIDのリスト
            
        Returns:
            通知メッセージとダミー出力
        """
        ctx = callback_context
        if not ctx.triggered or not any(n_clicks_list):
            raise PreventUpdate
        
        try:
            # クリックされたボタンのインデックスを特定
            button_index = next(
                i for i, n_clicks in enumerate(n_clicks_list)
                if n_clicks is not None and n_clicks > 0
            )
            path = button_ids[button_index]['path']
            action = button_ids[button_index]['action']
            
            if not path:
                return '', html.Div(
                    'Invalid path specified',
                    style={**STYLES['notification']['error'], 'opacity': 1}
                )
            
            # アクションタイプに基づいて許可するパスタイプを決定
            allow_directories = (action == 'フォルダを開く')
            
            # ファイル/フォルダを開く
            result = open_file_or_folder(path, allow_directories)
            
            # 結果に基づいて通知を表示
            notification_style = (
                STYLES['notification']['success']
                if result['success']
                else STYLES['notification']['error']
            )
            
            return '', html.Div(
                result['message'],
                style={**notification_style, 'opacity': 1}
            )
            
        except Exception as e:
            logger.error(f"Error in callback: {str(e)}")
            return '', html.Div(
                'An error occurred',
                style={**STYLES['notification']['error'], 'opacity': 1}
            )