from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys
from pathlib import Path
import logging
import time
from contextlib import asynccontextmanager

# ロギング設定を追加
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# モジュールのパスを追加
current_dir = Path(__file__).parent
if str(current_dir.parent) not in sys.path:
    sys.path.insert(0, str(current_dir.parent))

# アプリ初期化時にアプリケーション環境情報をログ出力
logger = logging.getLogger("api.startup")
logger.info(f"カレントディレクトリ: {os.getcwd()}")
logger.info(f"Python実行パス: {sys.executable}")
logger.info(f"Python バージョン: {sys.version}")
logger.info(f"環境変数 PMSUITE_DASHBOARD_FILE: {os.environ.get('PMSUITE_DASHBOARD_FILE', '未設定')}")
logger.info(f"環境変数 APP_PATH: {os.environ.get('APP_PATH', '未設定')}")

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

# ライフスパンイベントマネージャ (FastAPIの新しい推奨方法)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフスパンイベントを管理する"""
    # 起動時の処理
    logger.info("APIサーバーを起動しました")
    logger.info(f"アプリケーションURL: http://127.0.0.1:8000")
    logger.info(f"APIドキュメント: http://127.0.0.1:8000/docs")
    
    # データディレクトリのチェック
    data_dir = Path(os.getcwd()) / "data" / "exports"
    if not data_dir.exists():
        logger.warning(f"データディレクトリが見つかりません: {data_dir}")
        logger.info("サンプルデータが使用される可能性があります")
    
    yield  # アプリケーションの実行中
    
    # 終了時の処理
    logger.info("APIサーバーを終了します")

# アプリケーションインスタンスの作成
app = FastAPI(
    title="Project Dashboard API",
    description="API for the Project Management Dashboard",
    version="1.0.0",
    lifespan=lifespan  # 新しいライフスパンイベントマネージャを使用
)

# CORS設定 - デスクトップアプリケーションでの使用を考慮
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # デスクトップアプリでは制限する必要はない
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ロギングミドルウェア（正しいASGIミドルウェア構造）
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """リクエストとレスポンスをログに記録するミドルウェア"""
    # リクエストID
    request_id = request.headers.get("X-Request-ID", "unknown")
    
    # リクエスト情報をログに記録
    logger.info(f"Request {request_id}: {request.method} {request.url.path}")
    
    # クエリパラメータ
    if request.query_params:
        logger.info(f"Query params {request_id}: {dict(request.query_params)}")
    
    # リクエストの開始時間
    start_time = time.time()
    
    try:
        # 次のミドルウェアまたはエンドポイント処理
        response = await call_next(request)
        
        # 処理時間
        process_time = time.time() - start_time
        
        # レスポンス情報をログに記録
        logger.info(
            f"Response {request_id}: status={response.status_code}, "
            f"process_time={process_time:.3f}s"
        )
        
        return response
    except Exception as e:
        # エラー情報をログに記録
        logger.error(
            f"Error {request_id}: {type(e).__name__}, {str(e)}, "
            f"process_time={time.time() - start_time:.3f}s"
        )
        raise

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
        logger.info("シャットダウンリクエストを受信しました。アプリケーションを終了します。")
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
    
    logger.info(f"サーバーをポート {port} で起動します")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)