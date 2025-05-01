"""
システム状態管理のAPIエンドポイント
- システムの準備状態を確認するためのエンドポイントを提供
- ヘルスチェックやシャットダウン機能も含む
"""

from fastapi import APIRouter, Response, Request
from fastapi.responses import JSONResponse
from datetime import datetime
import os
import platform
import sys
import asyncio
import logging

from app.services.system_health import get_readiness_status

router = APIRouter()
logger = logging.getLogger("api.system")

@router.get("/system/readiness")
async def check_readiness():
    """
    システムの準備状態を確認するエンドポイント
    フロントエンドがバックエンドの準備状態を確認するために呼び出します
    
    Returns:
        準備状態の情報
    """
    # システム健全性モジュールから状態を取得
    readiness_info = get_readiness_status()
    
    return readiness_info

@router.post("/system/reset")
async def reset_system():
    """
    システムの状態をリセットするエンドポイント
    開発目的やテスト用途で使用します
    
    Returns:
        リセット結果
    """
    from app.services.system_health import reset_initialization_state
    
    # 開発環境でのみ有効
    if os.environ.get("DEBUG") != "1":
        return JSONResponse(
            status_code=403,
            content={"error": "This endpoint is only available in development mode"}
        )
    
    reset_initialization_state()
    
    return {"status": "reset_completed", "timestamp": datetime.now().isoformat()}

@router.get("/system/info")
async def system_info():
    """
    システム情報を取得するエンドポイント
    バックエンドの環境情報やリソース使用状況を提供します
    
    Returns:
        システム情報
    """
    try:
        # 基本情報の収集
        system_data = {
            "python_version": sys.version,
            "platform": platform.platform(),
            "environment": os.environ.get("FASTAPI_ENV", "development"),
            "system_health_enabled": os.environ.get("SYSTEM_HEALTH_ENABLED", "0") == "1",
            "time": datetime.now().isoformat()
        }
        
        # リソース情報の取得（psutilがある場合）
        try:
            import psutil
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            system_data.update({
                "resources": {
                    "cpu_percent": psutil.cpu_percent(interval=0.1),
                    "memory_total_mb": memory.total / (1024 * 1024),
                    "memory_available_mb": memory.available / (1024 * 1024),
                    "memory_percent": memory.percent,
                    "disk_total_gb": disk.total / (1024 * 1024 * 1024),
                    "disk_free_gb": disk.free / (1024 * 1024 * 1024),
                    "disk_percent": disk.percent
                }
            })
        except ImportError:
            system_data["resources"] = {"note": "psutil module not available"}
        
        # 初期化状態を追加
        system_data["initialization"] = get_readiness_status()
        
        return system_data
    except Exception as e:
        logger.error(f"システム情報取得エラー: {str(e)}")
        return {"error": str(e)}

@router.post("/shutdown")
async def shutdown():
    """
    アプリケーションを終了するエンドポイント
    
    Returns:
        シャットダウン状態
    """
    # 非同期でアプリケーションを終了
    async def shutdown_app():
        logger.info("シャットダウンリクエストを受信しました。アプリケーションを正常終了します。")
        await asyncio.sleep(0.5)
        os._exit(0)
    
    asyncio.create_task(shutdown_app())
    return {"status": "shutting_down"}