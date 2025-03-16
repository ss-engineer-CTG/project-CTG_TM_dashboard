from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys
from pathlib import Path

# 相対インポートに変更
try:
    # アプリがインストールされている場合は絶対インポートを使用
    from app.routers import projects, metrics, files, health
except ImportError:
    # ローカル開発環境の場合は相対インポートを試行
    try:
        from .routers import projects, metrics, files, health
    except ImportError:
        # 両方失敗した場合はPythonPathを調整
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from app.routers import projects, metrics, files, health

app = FastAPI(
    title="Project Dashboard API",
    description="API for the Project Management Dashboard",
    version="1.0.0"
)

# CORS設定 - デスクトップアプリケーションでの使用を考慮
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # デスクトップアプリでは制限する必要はない
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーターの登録
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(metrics.router, prefix="/api", tags=["metrics"])
app.include_router(files.router, prefix="/api", tags=["files"])
app.include_router(health.router, prefix="/api", tags=["health"])

# デスクトップアプリケーションからの終了シグナルを処理するためのシャットダウンエンドポイント
@app.post("/api/shutdown")
async def shutdown():
    """アプリケーションを終了するエンドポイント"""
    import asyncio
    # 非同期でアプリケーションを終了
    async def shutdown_app():
        await asyncio.sleep(1)
        os._exit(0)
    
    asyncio.create_task(shutdown_app())
    return {"status": "shutting down"}

if __name__ == "__main__":
    # 引数からポート番号を取得（デフォルトは8000）
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)