from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

@router.get("/health", response_model=dict)
async def health_check():
    """
    APIの健全性をチェックするエンドポイント
    
    Returns:
        ステータス情報
    """
    return {
        "status": "ok",
        "time": datetime.now().isoformat(),
        "version": "1.0.0"
    }