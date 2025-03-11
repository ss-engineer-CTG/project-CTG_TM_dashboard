"""
Electron用拡張サーバースクリプト
既存のDashアプリをElectronアプリとして実行するためのラッパー
"""

import os
import sys
import json
import logging
import threading
import datetime
import pandas as pd
from pathlib import Path

# 現在のディレクトリをPythonパスに追加
current_dir = Path(__file__).parent.resolve()
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(current_dir.parent))

# ログ設定
log_dir = current_dir / "logs"
log_dir.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename=str(log_dir / 'electron_server.log'),
    filemode='w'
)
logger = logging.getLogger("electron_server")

# サンプルデータディレクトリ
sample_data_dir = current_dir / "sample_data"
sample_data_dir.mkdir(exist_ok=True)

try:
    # Dash関連のインポート
    from flask import request, jsonify
    from dash import Dash
    from ProjectDashBoard.app import app
    import ProjectDashBoard.callbacks as callbacks
    
    # グローバル変数
    selected_file_path = None

    # カスタムルートの追加
    @app.server.route('/health', methods=['GET'])
    def health_check():
        """ヘルスチェックエンドポイント"""
        return "OK"

    @app.server.route('/initialize-sample-data', methods=['GET'])
    def initialize_sample_data():
        """サンプルデータを初期化するエンドポイント"""
        try:
            # サンプルCSVデータの作成
            dashboard_file = sample_data_dir / "dashboard.csv"
            projects_file = sample_data_dir / "projects.csv"
            
            # サンプルデータの作成 - dashboard.csv
            if not dashboard_file.exists():
                logger.info("Creating sample dashboard.csv file")
                
                # 現在日付から相対的な日付を計算
                today = datetime.datetime.now()
                
                # 過去のタスク（完了）
                past_start = today - datetime.timedelta(days=30)
                past_finish = today - datetime.timedelta(days=15)
                
                # 現在のタスク（進行中）
                current_start = today - datetime.timedelta(days=10)
                current_finish = today + datetime.timedelta(days=10)
                
                # 将来のタスク
                future_start = today + datetime.timedelta(days=15)
                future_finish = today + datetime.timedelta(days=30)
                
                # サンプルデータ
                data = {
                    'project_id': ['P001', 'P001', 'P001', 'P002', 'P002', 'P003'],
                    'project_name': ['Web開発プロジェクト', 'Web開発プロジェクト', 'Web開発プロジェクト', 
                                    'モバイルアプリ開発', 'モバイルアプリ開発', 'システム改修'],
                    'process': ['開発', '開発', '開発', 'テスト', 'テスト', '設計'],
                    'line': ['Webライン', 'Webライン', 'Webライン', 'モバイルライン', 'モバイルライン', 'インフラライン'],
                    'task_id': [1, 2, 3, 4, 5, 6],
                    'task_name': ['要件定義', 'フロントエンド開発', 'バックエンド開発', 'UIデザイン', 'テスト実施', 'システム設計'],
                    'task_status': ['完了', '進行中', '未着手', '完了', '進行中', '未着手'],
                    'task_start_date': [
                        past_start.strftime('%Y-%m-%d'),
                        current_start.strftime('%Y-%m-%d'),
                        future_start.strftime('%Y-%m-%d'),
                        past_start.strftime('%Y-%m-%d'),
                        current_start.strftime('%Y-%m-%d'),
                        future_start.strftime('%Y-%m-%d')
                    ],
                    'task_finish_date': [
                        past_finish.strftime('%Y-%m-%d'),
                        current_finish.strftime('%Y-%m-%d'),
                        future_finish.strftime('%Y-%m-%d'),
                        past_finish.strftime('%Y-%m-%d'),
                        current_finish.strftime('%Y-%m-%d'),
                        future_finish.strftime('%Y-%m-%d')
                    ],
                    'task_milestone': ['○', '', '○', '', '○', ''],
                    'created_at': [today.strftime('%Y-%m-%d')] * 6,
                }
                
                df = pd.DataFrame(data)
                df.to_csv(dashboard_file, index=False, encoding='utf-8-sig')
                
            # サンプルデータの作成 - projects.csv
            if not projects_file.exists():
                logger.info("Creating sample projects.csv file")
                
                data = {
                    'project_id': ['P001', 'P002', 'P003'],
                    'project_name': ['Web開発プロジェクト', 'モバイルアプリ開発', 'システム改修'],
                    'project_path': [str(sample_data_dir), str(sample_data_dir), str(sample_data_dir)],
                    'ganttchart_path': [str(dashboard_file), str(dashboard_file), str(dashboard_file)],
                }
                
                df = pd.DataFrame(data)
                df.to_csv(projects_file, index=False, encoding='utf-8-sig')
            
            # コールバックモジュールの変数を更新
            global selected_file_path
            selected_file_path = str(dashboard_file)
            callbacks.DASHBOARD_FILE_PATH = selected_file_path
            
            logger.info(f"サンプルデータ初期化完了: {selected_file_path}")
            return jsonify({"status": "success", "message": "Sample data initialized", "file_path": str(dashboard_file)})
            
        except Exception as e:
            logger.error(f"サンプルデータ初期化エラー: {str(e)}")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.server.route('/update-file-path', methods=['POST'])
    def update_file_path():
        """ファイルパスを更新するエンドポイント"""
        global selected_file_path
        try:
            data = request.get_json()
            if not data or 'file_path' not in data:
                # デフォルトパスを試行
                dashboard_file = sample_data_dir / "dashboard.csv"
                if dashboard_file.exists():
                    selected_file_path = str(dashboard_file)
                    logger.info(f"デフォルトパスを使用: {selected_file_path}")
                    callbacks.DASHBOARD_FILE_PATH = selected_file_path
                    return jsonify({"status": "success", "message": "Default file path set"})
                
                return jsonify({"status": "error", "message": "Invalid request: file_path is required"}), 400

            new_path = data['file_path']
            if not Path(new_path).exists():
                return jsonify({"status": "error", "message": f"File does not exist: {new_path}"}), 404

            selected_file_path = new_path
            logger.info(f"Updated file path: {selected_file_path}")
            
            # コールバックモジュールの変数も更新
            callbacks.DASHBOARD_FILE_PATH = selected_file_path
            
            return jsonify({"status": "success", "message": "File path updated"})
        except Exception as e:
            logger.error(f"Error updating file path: {str(e)}")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.server.route('/refresh-dashboard', methods=['POST'])
    def refresh_dashboard():
        """ダッシュボードデータを更新するエンドポイント"""
        try:
            # 更新ボタンのクリック数を増やして更新をトリガー
            # これはコールバックの仕組みを利用している
            # 実際のアプリケーションに合わせて調整が必要
            return jsonify({"status": "success", "message": "Dashboard refresh triggered"})
        except Exception as e:
            logger.error(f"Error refreshing dashboard: {str(e)}")
            return jsonify({"status": "error", "message": str(e)}), 500

    def run_server():
        """サーバーをバックグラウンドで実行"""
        try:
            logger.info("Starting Dash server")
            app.run_server(
                debug=False,
                port=8050,
                host='127.0.0.1',
                use_reloader=False,
                threaded=True
            )
        except Exception as e:
            logger.error(f"Server error: {str(e)}")
            sys.exit(1)

    if __name__ == "__main__":
        logger.info("Initializing Electron-compatible server")
        
        # サーバーを別スレッドで起動（終了時のクリーンアップのため）
        server_thread = threading.Thread(target=run_server)
        server_thread.daemon = True
        server_thread.start()
        
        # メインスレッドはアイドル状態を維持
        try:
            server_thread.join()
        except KeyboardInterrupt:
            logger.info("Server terminated by keyboard interrupt")
            sys.exit(0)

except Exception as e:
    logger.error(f"Initialization error: {str(e)}")
    import traceback
    logger.error(traceback.format_exc())
    sys.exit(1)