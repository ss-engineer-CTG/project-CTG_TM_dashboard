"""
ファイル操作関連のユーティリティ関数 - 最適化版
- ファイルパスの検証
- ファイル/フォルダを開く機能
"""

import os
import platform
import subprocess
import logging
from pathlib import Path
from typing import Optional, Dict, Any

# 遅延インポート用のインポート
from .async_loader import lazy_import

# ロガー設定
logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)
logger.setLevel(logging.INFO)

def validate_file_path(path: Optional[str], allow_directories: bool = True) -> Optional[str]:
    """
    ファイルパスの検証と正規化を行う
    
    Args:
        path: 検証するファイルパス
        allow_directories: ディレクトリを許可するかどうか
        
    Returns:
        検証済みの正規化されたパス、または無効な場合はNone
    """
    try:
        # 動的インポート
        pd = lazy_import("pandas")
        
        if not path or pd.isna(path):
            logger.warning("Empty or NaN path provided")
            return None
            
        # パスの正規化前にデバッグ情報
        logger.info(f"Original path: {path}")
        
        # 文字列型の確認と変換
        if not isinstance(path, str):
            path = str(path)
        
        # パスの正規化
        normalized_path = str(Path(path).resolve())
        logger.info(f"Normalized path: {normalized_path}")
        
        # ディレクトリの場合は拡張子チェックをスキップ
        if os.path.isdir(normalized_path):
            if not allow_directories:
                logger.warning(f"Path is a directory but directories are not allowed: {normalized_path}")
                return None
            return normalized_path
            
        # ファイルの場合は拡張子チェック
        valid_extensions = [
            '.xlsx', '.xls', '.xlsm', '.xltx', '.xltm',
            '.xml', '.mpp', '.mpt', '.pdf',
            '.html', '.htm', '.csv'
        ]
        
        file_extension = Path(normalized_path).suffix.lower()
        logger.info(f"File extension: {file_extension}")
        
        if not any(normalized_path.lower().endswith(ext) for ext in valid_extensions):
            logger.warning(f"Invalid file extension for path: {normalized_path}")
            return None
        
        # 基本的なセキュリティチェック
        if any(char in normalized_path for char in ['<', '>', '|', '"', '?', '*']):
            logger.warning(f"Invalid characters found in path: {normalized_path}")
            return None
            
        # パスの存在確認と詳細ログ
        if not os.path.exists(normalized_path):
            logger.warning(f"Path does not exist: {normalized_path}")
            # 親ディレクトリの存在確認
            parent_dir = os.path.dirname(normalized_path)
            if not os.path.exists(parent_dir):
                logger.warning(f"Parent directory does not exist: {parent_dir}")
            return None
            
        # ファイルアクセス権のチェック
        if not os.access(normalized_path, os.R_OK):
            logger.warning(f"No read permission for path: {normalized_path}")
            return None
            
        logger.info(f"Path validation successful: {normalized_path}")
        return normalized_path
        
    except Exception as e:
        logger.error(f"Error validating path {path}: {str(e)}")
        return None

def open_file_or_folder(path: str, allow_directories: bool = True) -> Dict[str, Any]:
    """
    ファイルまたはフォルダを開く
    
    Args:
        path: 開くファイルまたはフォルダのパス
        allow_directories: ディレクトリを許可するかどうか
        
    Returns:
        結果を示す辞書
    """
    try:
        logger.info(f"Attempting to open path: {path}")
        
        # allow_directoriesパラメータに基づいて検証
        validated_path = validate_file_path(path, allow_directories=allow_directories)
        
        if not validated_path:
            return {
                'success': False,
                'message': 'Invalid path specified',
                'type': 'error'
            }
        
        system = platform.system()
        result = {'success': False, 'message': '', 'type': 'error'}
        
        try:
            if system == 'Windows':
                os.startfile(validated_path)
                result = {'success': True, 'message': 'File opened successfully', 'type': 'success'}
            elif system == 'Darwin':  # macOS
                subprocess.run(['open', validated_path], check=True)
                result = {'success': True, 'message': 'File opened successfully', 'type': 'success'}
            elif system == 'Linux':
                subprocess.run(['xdg-open', validated_path], check=True)
                result = {'success': True, 'message': 'File opened successfully', 'type': 'success'}
            else:
                result = {
                    'success': False,
                    'message': f'Unsupported operating system: {system}',
                    'type': 'error'
                }
        except subprocess.CalledProcessError as e:
            logger.error(f"Process error opening file: {str(e)}")
            result = {
                'success': False,
                'message': f'Failed to open file: {str(e)}',
                'type': 'error'
            }
        except Exception as e:
            logger.error(f"Unexpected error opening file: {str(e)}")
            result = {
                'success': False,
                'message': f'Unexpected error: {str(e)}',
                'type': 'error'
            }
            
        return result
        
    except Exception as e:
        logger.error(f"Error in open_file_or_folder: {str(e)}")
        return {
            'success': False,
            'message': f'System error: {str(e)}',
            'type': 'error'
        }