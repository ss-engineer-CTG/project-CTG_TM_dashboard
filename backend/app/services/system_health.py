"""
システム健全性管理モジュール
- アプリケーションの準備状態を追跡・管理するためのユーティリティ
- コンポーネントの準備状態を登録・取得するための関数を提供
"""

import time
import logging
import threading
from typing import Dict, Any, List, Literal

# ロガー設定
logger = logging.getLogger("api.system_health")

# 初期化状態を追跡するグローバル変数
initialization_state = {
    "status": "initializing",  # initializing → partial → complete → error
    "progress": 0,
    "start_time": time.time(),
    "components": {
        "server": False,
        # 以下の未使用コンポーネントを削除
        # "database": False,  # 使用されていないコンポーネント
        # "numpy": False,     # 使用されていないコンポーネント
        "pandas": False,
        "async_loader": False
    },
    "details": {}
}

# 状態変更のロック
state_lock = threading.RLock()

def get_readiness_status() -> Dict[str, Any]:
    """
    システムの準備状態を取得する
    
    Returns:
        準備状態の情報を含む辞書
    """
    global initialization_state
    
    with state_lock:
        # コンポーネントのチェック数に基づいて進捗を計算
        ready_components = sum(1 for v in initialization_state["components"].values() if v)
        total_components = len(initialization_state["components"])
        
        if total_components > 0:
            initialization_state["progress"] = int(100 * ready_components / total_components)
        else:
            initialization_state["progress"] = 0
        
        # 全コンポーネントが準備完了なら complete を設定
        if all(initialization_state["components"].values()) and total_components > 0:
            initialization_state["status"] = "complete"
        # 一部のコンポーネントのみ準備完了なら partial を設定
        elif any(initialization_state["components"].values()):
            initialization_state["status"] = "partial"
        
        # 経過時間を計算
        elapsed_time = time.time() - initialization_state["start_time"]
        
        # レスポンス用の辞書を作成
        response = {
            "readiness": initialization_state["status"],
            "progress": initialization_state["progress"],
            "components": initialization_state["components"],
            "elapsed_seconds": round(elapsed_time, 2)
        }
        
        # 詳細情報がある場合は追加
        if initialization_state["details"]:
            response["details"] = initialization_state["details"]
        
        return response

def register_component_ready(component_name: str, details: Dict[str, Any] = None) -> None:
    """
    コンポーネントの準備完了を登録する
    
    Args:
        component_name: コンポーネント名
        details: 詳細情報（オプション）
    """
    global initialization_state
    
    with state_lock:
        # コンポーネントが存在するか確認
        if component_name not in initialization_state["components"]:
            # 必要に応じて新しいコンポーネントを追加
            initialization_state["components"][component_name] = False
            logger.info(f"新しいコンポーネント '{component_name}' を追加しました")
        
        # コンポーネントを準備完了に設定
        initialization_state["components"][component_name] = True
        
        # 詳細情報がある場合は追加
        if details:
            if "details" not in initialization_state:
                initialization_state["details"] = {}
            
            initialization_state["details"][component_name] = details
        
        # 進捗状況を計算
        ready_components = sum(1 for v in initialization_state["components"].values() if v)
        total_components = len(initialization_state["components"])
        initialization_state["progress"] = int(100 * ready_components / total_components)
        
        # ステータスを更新
        if all(initialization_state["components"].values()):
            old_status = initialization_state["status"]
            initialization_state["status"] = "complete"
            
            if old_status != "complete":
                logger.info("すべてのコンポーネントの初期化が完了しました！システムは完全に準備が整いました")
        else:
            initialization_state["status"] = "partial"
        
        logger.info(f"コンポーネント '{component_name}' の初期化が完了しました (進捗: {initialization_state['progress']}%)")

def set_component_error(component_name: str, error_details: str) -> None:
    """
    コンポーネントのエラーを設定する
    
    Args:
        component_name: コンポーネント名
        error_details: エラーの詳細情報
    """
    global initialization_state
    
    with state_lock:
        # コンポーネントが存在するか確認
        if component_name not in initialization_state["components"]:
            # 必要に応じて新しいコンポーネントを追加
            initialization_state["components"][component_name] = False
            logger.info(f"新しいコンポーネント '{component_name}' を追加しました")
        
        # エラー情報を追加
        if "details" not in initialization_state:
            initialization_state["details"] = {}
        
        initialization_state["details"][component_name] = {"error": error_details}
        
        # 全体状態をエラーに設定
        initialization_state["status"] = "error"
        
        logger.error(f"コンポーネント '{component_name}' の初期化に失敗しました: {error_details}")

def reset_initialization_state() -> None:
    """初期化状態をリセットする"""
    global initialization_state
    
    with state_lock:
        initialization_state = {
            "status": "initializing",
            "progress": 0,
            "start_time": time.time(),
            "components": {
                "server": False,
                # "database": False,  # 使用されていないコンポーネント
                # "numpy": False,     # 使用されていないコンポーネント
                "pandas": False,
                "async_loader": False
            },
            "details": {}
        }
        
        logger.info("初期化状態をリセットしました")

def get_component_status(component_name: str) -> Dict[str, Any]:
    """
    特定のコンポーネントの状態を取得する
    
    Args:
        component_name: コンポーネント名
        
    Returns:
        コンポーネントの状態情報
    """
    global initialization_state
    
    with state_lock:
        is_ready = initialization_state["components"].get(component_name, False)
        details = initialization_state.get("details", {}).get(component_name, {})
        
        return {
            "ready": is_ready,
            "details": details
        }