from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys
import socket
import tempfile
from pathlib import Path
import logging
import time
from contextlib import asynccontextmanager

# ロギング設定を変更 - DEBUGレベルに
logging.basicConfig(
    level=logging.DEBUG,  # INFOからDEBUGに変更し、より詳細なログを出力
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
logger.info(f"環境変数 ELECTRON_PORT: {os.environ.get('ELECTRON_PORT', '未設定')}")

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

# より強力なポート確認と割り当てロジック
def find_best_available_port(preferred_ports=[8000, 8080, 8888, 8081, 8001, 3001, 5000], timeout=5):
    """
    優先度順にポートの利用可能性を確認し、最適なポートを返す
    
    Args:
        preferred_ports: 優先度順のポートリスト
        timeout: 各ポートの確認タイムアウト(秒)
        
    Returns:
        使用可能なポート番号、見つからなければNone
    """
    import socket
    import time
    from contextlib import closing
    
    start_time = time.time()
    logger.info(f"利用可能なポートの検索を開始: {preferred_ports}")
    
    # 明示的に引数で指定されたポートを最初に試す
    if len(sys.argv) > 1:
        try:
            arg_port = int(sys.argv[1])
            if arg_port not in preferred_ports:
                preferred_ports.insert(0, arg_port)
                logger.info(f"コマンドライン引数で指定されたポート {arg_port} を最優先で試行します")
        except (ValueError, IndexError):
            pass
    
    # Electron環境変数からのポート指定を確認
    electron_port = os.environ.get('ELECTRON_PORT')
    if electron_port:
        try:
            electron_port_int = int(electron_port)
            if electron_port_int not in preferred_ports:
                preferred_ports.insert(0, electron_port_int)
                logger.info(f"環境変数で指定されたポート {electron_port_int} を最優先で試行します")
        except ValueError:
            logger.warning(f"環境変数 ELECTRON_PORT の値 {electron_port} は有効なポート番号ではありません")
    
    for port in preferred_ports:
        # 短いタイムアウトでソケット接続テスト
        try:
            with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
                sock.settimeout(timeout)
                result = sock.connect_ex(('127.0.0.1', port))
                if result != 0:  # 接続に失敗 = ポートが空いている
                    # 二重確認
                    try:
                        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                            s.bind(('127.0.0.1', port))
                            logger.info(f"ポート {port} は利用可能です")
                            return port
                    except OSError:
                        logger.warning(f"ポート {port} は使用中か、バインドできません")
                        continue
                else:
                    logger.warning(f"ポート {port} は使用中です")
        except Exception as e:
            logger.error(f"ポート {port} の確認中にエラー: {str(e)}")
    
    logger.error(f"利用可能なポートが見つかりませんでした (検索時間: {time.time() - start_time:.2f}秒)")
    # 緊急時のフォールバック - ランダムな高ポート
    import random
    fallback_port = random.randint(10000, 65000)
    logger.warning(f"緊急フォールバック: ランダムな高ポート {fallback_port} を使用します")
    return fallback_port

# ライフスパンイベントマネージャ (FastAPIの新しい推奨方法)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフスパンイベントを管理する"""
    # 起動時の処理
    logger.info("APIサーバーを起動しました")
    logger.info(f"アプリケーションURL: http://127.0.0.1:{app.state.port}")
    logger.info(f"APIドキュメント: http://127.0.0.1:{app.state.port}/docs")
    
    # データディレクトリのチェック
    data_dir = Path(os.getcwd()) / "data" / "exports"
    if not data_dir.exists():
        logger.warning(f"データディレクトリが見つかりません: {data_dir}")
        logger.info("サンプルデータが使用される可能性があります")
    
    # tkinterの利用可能性をチェック
    try:
        import tkinter
        logger.info("tkinterは利用可能です")
    except ImportError:
        logger.warning("tkinterが利用できません。ファイル選択ダイアログが表示されない可能性があります。")
        logger.info("適切なパッケージをインストールしてください (pip install python-tk または apt-get install python3-tk)")
    
    # ポート情報を一時ファイルに保存
    try:
        port_file_path = os.path.join(tempfile.gettempdir(), "project_dashboard_port.txt")
        with open(port_file_path, "w") as f:
            f.write(str(app.state.port))
        logger.info(f"ポート情報をファイルに保存しました: {port_file_path}")
    except Exception as e:
        logger.error(f"ポート情報ファイルの作成エラー: {str(e)}")
    
    yield  # アプリケーションの実行中
    
    # 終了時の処理
    logger.info("APIサーバーを終了します")
    
    # ポート情報ファイルの削除を試みる
    try:
        port_file_path = os.path.join(tempfile.gettempdir(), "project_dashboard_port.txt")
        if os.path.exists(port_file_path):
            os.remove(port_file_path)
            logger.info(f"ポート情報ファイルを削除しました: {port_file_path}")
    except Exception as e:
        logger.error(f"ポート情報ファイルの削除エラー: {str(e)}")

# アプリケーションインスタンスの作成（ポート情報を初期化）
def create_app(port=8000):
    app = FastAPI(
        title="Project Dashboard API",
        description="API for the Project Management Dashboard",
        version="1.0.0",
        lifespan=lifespan  # 新しいライフスパンイベントマネージャを使用
    )
    
    # ポート情報をアプリケーションの状態に保存
    app.state.port = port
    
    # CORS設定を強化 - デスクトップアプリケーションでの使用を考慮
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # デスクトップアプリでは制限する必要はない
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],  # 追加: レスポンスヘッダーの公開
    )
    
    # ロギングミドルウェア（正しいASGIミドルウェア構造）
    @app.middleware("http")
    async def logging_middleware(request: Request, call_next):
        """リクエストとレスポンスをログに記録するミドルウェア"""
        # リクエストID
        request_id = request.headers.get("X-Request-ID", "unknown")
        
        # リクエスト情報をログに記録
        logger.info(f"Request {request_id}: {request.method} {request.url.path}")
        
        # リクエストヘッダーを記録（デバッグ用）
        headers_dict = dict(request.headers)
        logger.debug(f"Request headers {request_id}: {headers_dict}")
        
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
            
            # CORSヘッダーの追加を確認
            response.headers["Access-Control-Allow-Origin"] = "*"
            
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
    
    return app

if __name__ == "__main__":
    # ポート検出を改善
    port = find_best_available_port()
    
    if not port:
        logger.critical("利用可能なポートが見つかりません。アプリケーションを終了します。")
        sys.exit(1)
        
    logger.info(f"選択されたポート: {port}")
    
    # アプリケーションの作成
    app = create_app(port)
    
    # サーバーの起動設定を改善
    uvicorn.run(
        app,  # 直接appインスタンスを渡す
        host="127.0.0.1",  # localhostではなく明示的にIPv4を指定
        port=port, 
        reload=False,
        log_level="info",
        access_log=True,
        timeout_keep_alive=60   # キープアライブタイムアウトを拡張
    )