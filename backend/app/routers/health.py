from fastapi import APIRouter, Response
from datetime import datetime
import os
import platform
import sys

router = APIRouter()

@router.get("/health", response_model=dict)
async def health_check(response: Response):
    """
    APIの健全性をチェックするエンドポイント
    
    Returns:
        ステータス情報
    """
    try:
        # サーバー情報を取得
        python_version = sys.version
        os_info = f"{platform.system()} {platform.release()}"
        
        # 環境変数の確認
        dashboard_file = os.environ.get("PMSUITE_DASHBOARD_FILE", "未設定")
        app_path = os.environ.get("APP_PATH", "未設定")
        
        # ファイルの存在確認
        file_exists = False
        file_error = None
        
        if dashboard_file != "未設定":
            try:
                file_exists = os.path.isfile(dashboard_file)
                if not file_exists:
                    file_error = f"ファイルが存在しません: {dashboard_file}"
            except Exception as e:
                file_error = f"ファイル確認エラー: {str(e)}"
        
        return {
            "status": "ok",
            "time": datetime.now().isoformat(),
            "version": "1.0.0",
            "environment": {
                "python_version": python_version,
                "os_info": os_info,
                "dashboard_file": dashboard_file,
                "dashboard_file_exists": file_exists,
                "file_error": file_error,
                "app_path": app_path
            }
        }
    except Exception as e:
        response.status_code = 500
        return {
            "status": "error",
            "time": datetime.now().isoformat(),
            "error": str(e)
        }