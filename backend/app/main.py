from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys

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