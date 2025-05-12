"""
ログ設定ユーティリティ
- ログディレクトリとファイルの管理
- ロガー設定の一元化
"""

import os
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import sys
from typing import Optional

# data_processing.pyからCSVパス解決関数をインポート
from .data_processing import resolve_dashboard_path

def get_log_directory() -> Path:
    """
    ログディレクトリのパスを取得する
    - CSVファイルがあるディレクトリと同じ階層に'logs'ディレクトリを作成
    
    Returns:
        ログディレクトリのパス
    """
    # CSVファイルパスを取得
    csv_path = resolve_dashboard_path()
    csv_dir = Path(csv_path).parent  # exports ディレクトリ
    
    # logsディレクトリを作成（dashboard.csvのある場所の親ディレクトリに）
    logs_dir = csv_dir.parent / "logs"
    
    # ディレクトリが存在しない場合は作成
    if not logs_dir.exists():
        try:
            logs_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"ログディレクトリの作成に失敗しました: {e}")
            # 失敗した場合は一時ディレクトリを使用
            import tempfile
            logs_dir = Path(tempfile.gettempdir()) / "project_dashboard" / "logs"
            logs_dir.mkdir(parents=True, exist_ok=True)
    
    return logs_dir

def setup_logging(log_level: int = logging.INFO, log_to_file: bool = True, 
                 app_name: str = "project_dashboard") -> None:
    """
    ロギング設定を行う
    
    Args:
        log_level: ログレベル
        log_to_file: ファイルへのログ出力を有効にするかどうか
        app_name: アプリケーション名（ログファイル名に使用）
    """
    # ルートロガーの設定
    root_logger = logging.getLogger()
    
    # 既存のハンドラーを削除（二重登録防止）
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    root_logger.setLevel(log_level)
    
    # フォーマッターの作成
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # 標準出力へのハンドラー
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # ファイルへのハンドラー（オプション）
    if log_to_file:
        try:
            logs_dir = get_log_directory()
            log_file = logs_dir / f"{app_name}.log"
            
            # ローテーティングファイルハンドラーの作成（10MBで最大5ファイル）
            file_handler = RotatingFileHandler(
                log_file, maxBytes=10_485_760, backupCount=5
            )
            file_handler.setFormatter(formatter)
            root_logger.addHandler(file_handler)
            
            # ログファイルの設定完了を記録
            root_logger.info(f"ログファイルを設定しました: {log_file}")
        except Exception as e:
            root_logger.error(f"ログファイルの設定に失敗しました: {e}")