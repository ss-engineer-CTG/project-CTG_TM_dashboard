from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys
import socket
import tempfile
from pathlib import Path
import logging
import time
import asyncio
import importlib
import traceback

# パフォーマンス計測
startup_time = time.time()
performance_metrics = {
    'startup_time': startup_time,
    'stages': []
}

def record_stage(stage_name):
    """パフォーマンスステージを記録"""
    performance_metrics['stages'].append({
        'name': stage_name,
        'time': time.time() - startup_time
    })
    # 最適化モードのみログ出力
    if os.environ.get('FASTAPI_STARTUP_OPTIMIZE') == '1':
        print(f"PERF: {stage_name} - {time.time() - startup_time:.3f}s")

# 最初のステージを記録
record_stage('initialization_start')

# 最適化環境変数を確認
is_optimized = os.environ.get('FASTAPI_STARTUP_OPTIMIZE') == '1'
streamlined_logging = os.environ.get('STREAMLINED_LOGGING') == '1'
debug_mode = os.environ.get('DEBUG') == '1'
system_health_enabled = os.environ.get('SYSTEM_HEALTH_ENABLED') == '1'

# ロギング設定 - デバッグモードでロギングレベルを変更
log_level = logging.INFO if debug_mode else logging.WARNING if is_optimized else logging.INFO
logging.basicConfig(
    level=log_level,
    format="%(asctime)s.%(msecs)03d - %(levelname)s: %(message)s" if streamlined_logging else "%(asctime)s.%(msecs)03d - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)

# モジュールのパスを追加
current_dir = Path(__file__).parent
if str(current_dir.parent) not in sys.path:
    sys.path.insert(0, str(current_dir.parent))

# 最小限のアプリ初期化情報をログ出力
logger = logging.getLogger("api.startup")
logger.info(f"バックエンドサーバー初期化中...")

# Python環境情報を出力
logger.info(f"Python バージョン: {sys.version}")
logger.info(f"実行パス: {sys.executable}")
logger.info(f"作業ディレクトリ: {os.getcwd()}")

# 早期モジュールインポート
preloaded_modules = {}
def preload_modules():
    """主要モジュールの事前ロード（起動高速化）"""
    global preloaded_modules
    try:
        # 主要モジュールを先にロード
        modules_to_preload = [
            'uvicorn', 'fastapi',
            'app.routers.health',
            'app.services.async_loader'
        ]
        
        # システム健全性モジュールが有効な場合は追加
        if system_health_enabled:
            modules_to_preload.append('app.services.system_health')
            modules_to_preload.append('app.routers.system')
        
        for module_name in modules_to_preload:
            try:
                start_time = time.time()
                preloaded_modules[module_name] = importlib.import_module(module_name)
                load_time = time.time() - start_time
                if load_time > 0.1:  # 100ms以上かかったモジュールだけ記録
                    record_stage(f'preload_{module_name}')
            except ImportError as e:
                print(f"モジュール {module_name} のプリロードに失敗: {e}")
        
        record_stage('modules_preloaded')
        return True
    except Exception as e:
        print(f"モジュールプリロード総合エラー: {e}")
        return False

# 最適化環境変数をチェックしてモジュールをプリロード
if is_optimized:
    preload_modules()

# より強力なポート確認と割り当てロジック - 改善版
def find_best_available_port(preferred_ports=[8000, 8080, 8888, 8081, 8001, 3001, 5000], timeout=1.0):
    """
    ポート検出の高速化と改善
    
    Args:
        preferred_ports: 優先度順のポートリスト
        timeout: 各ポートの確認タイムアウト(秒)
        
    Returns:
        使用可能なポート番号、見つからなければNone
    """
    import socket
    
    # コマンドライン引数（最優先）
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        arg_port = int(sys.argv[1])
        logger.info(f"コマンドライン引数からポート {arg_port} を最優先します")
        # コマンドライン引数は必ず使用する（存在チェックなし）
        return arg_port
    
    # 環境変数（次に優先）
    env_port = os.environ.get('ELECTRON_PORT') or os.environ.get('API_PORT')
    if env_port and env_port.isdigit():
        logger.info(f"環境変数からポート {env_port} を取得しました")
        # 環境変数指定のポートも必ず使用
        return int(env_port)
    
    record_stage('port_detection_start')
    
    # ポート検索 (一時ファイルは検索しない - Electron側のみで扱う)
    for port in preferred_ports:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(timeout)
                result = sock.connect_ex(('127.0.0.1', port))
                if result != 0:  # 0でなければ使用可能
                    logger.info(f"使用可能なポート {port} を検出")
                    return port
        except Exception as e:
            logger.error(f"ポート {port} の確認中にエラー: {e}")
    
    record_stage('port_detection_complete')
    
    # どのポートも使用できない場合はランダムな高ポート
    import random
    fallback_port = random.randint(10000, 65000)
    logger.warning(f"利用可能なポートが見つからないため、ランダムポート {fallback_port} を使用")
    return fallback_port

# 非クリティカルな初期化タスクを非同期実行
async def run_background_tasks():
    """非クリティカルな初期化タスクを非同期実行"""
    await asyncio.sleep(1)  # メインの起動を優先
    
    try:
        # AsyncLoaderの初期化処理を実行
        from app.services.async_loader import initialize_background_tasks
        await initialize_background_tasks()
        
        # データディレクトリのチェック
        data_dir = Path(os.getcwd()) / "data" / "exports"
        if not data_dir.exists():
            logger.warning(f"データディレクトリがありません: {data_dir}")
        
        # パフォーマンス統計を出力
        logger.debug("バックグラウンドタスク完了")
        logger.debug("=== パフォーマンス統計 ===")
        for stage in performance_metrics['stages']:
            logger.debug(f"{stage['name']}: {stage['time']:.3f}s")
        
    except Exception as e:
        logger.error(f"バックグラウンドタスクエラー: {str(e)}")
        logger.error(traceback.format_exc())
        
        # システム健全性モジュールがある場合はエラーを登録
        if system_health_enabled:
            try:
                from app.services.system_health import set_component_error
                set_component_error("background_tasks", str(e))
            except ImportError:
                pass

# ライフスパンイベントマネージャ
async def lifespan(app: FastAPI):
    """アプリケーションのライフスパンイベントを管理する"""
    record_stage('lifespan_start')
    
    # システム健全性モジュールの初期化
    if system_health_enabled:
        try:
            from app.services.system_health import register_component_ready
            logger.info("システム健全性モジュールを初期化しています...")
        except ImportError:
            logger.warning("システム健全性モジュールが見つかりません")
    
    # 全てのルーターを明示的に登録
    logger.info("ルーターを登録しています...")
    try:
        # health ルーター
        if 'app.routers.health' in preloaded_modules:
            app.include_router(preloaded_modules['app.routers.health'].router, prefix="/api", tags=["health"])
        else:
            from app.routers import health
            app.include_router(health.router, prefix="/api", tags=["health"])
        
        # システム健全性ルーター - 条件に応じて登録
        if system_health_enabled:
            if 'app.routers.system' in preloaded_modules:
                app.include_router(preloaded_modules['app.routers.system'].router, prefix="/api", tags=["system"])
            else:
                try:
                    from app.routers import system
                    app.include_router(system.router, prefix="/api", tags=["system"])
                except ImportError:
                    logger.warning("システムルーターをインポートできません")
        
        # 残りのルーターを直接登録
        from app.routers import projects, metrics, files
        
        app.include_router(projects.router, prefix="/api", tags=["projects"])
        app.include_router(metrics.router, prefix="/api", tags=["metrics"])
        app.include_router(files.router, prefix="/api", tags=["files"])
        
        logger.info("全てのルーターが正常に登録されました")
    except ImportError as e:
        logger.error(f"ルーターのインポートに失敗しました: {e}")
        logger.error(traceback.format_exc())
    
    # 起動時の処理
    logger.info("=== APIサーバーを起動しました ===")
    
    # ポートを安全に取得
    port = getattr(app.state, 'port', '不明')
    logger.info(f"リッスンポート: {port}")
    logger.info(f"API URL: http://127.0.0.1:{port}/api")
    
    # サーバーコンポーネントの準備完了を登録
    if system_health_enabled:
        try:
            from app.services.system_health import register_component_ready
            register_component_ready("server", {
                "startup_time": time.time() - startup_time,
                "port": port
            })
        except ImportError:
            pass
    
    # 非同期でバックグラウンドタスクを実行
    background_task = asyncio.create_task(run_background_tasks())
    
    record_stage('application_startup_complete')
    print(f"*** API Server is running at: http://127.0.0.1:{port}/api ***")
    print(f"*** Application startup complete ***")
    
    yield  # アプリケーションの実行中
    
    # 終了時の処理
    logger.info("APIサーバーを終了します")
    
    # バックグラウンドタスクが完了してない場合はキャンセル
    if not background_task.done():
        background_task.cancel()
    
    # ポート情報ファイルの削除を試みる
    try:
        port_file_path = os.path.join(tempfile.gettempdir(), "project_dashboard_port.txt")
        if os.path.exists(port_file_path):
            os.remove(port_file_path)
    except Exception:
        pass

# アプリケーションインスタンスの作成（ポート情報を初期化）
def create_app(port=8000):
    record_stage('create_app_start')
    
    app = FastAPI(
        title="Project Dashboard API",
        description="API for the Project Management Dashboard",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None if not os.environ.get('DEBUG') else "/docs",
    )
    
    # ポート情報をアプリケーションの状態に保存
    app.state.port = port
    
    # CORS設定
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"]
    )
    
    # 最適化モード時はミドルウェアを減らして起動を高速化
    if not is_optimized:
        # ロギングミドルウェア - 開発時のみ
        @app.middleware("http")
        async def logging_middleware(request: Request, call_next):
            """リクエストとレスポンスをログに記録するミドルウェア"""
            # 開発モードでのみ詳細ログ
            if os.environ.get('DEBUG'):
                # リクエストID
                request_id = request.headers.get("X-Request-ID", "unknown")
                
                # リクエスト情報をログに記録
                logger.info(f"Request {request_id}: {request.method} {request.url.path}")
                
                # リクエストの開始時間
                start_time = time.time()
            
            # 次のミドルウェアまたはエンドポイント処理
            response = await call_next(request)
            
            # 開発モードでのみ詳細ログ
            if os.environ.get('DEBUG'):
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
    
    record_stage('create_app_complete')
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
    log_config = None if is_optimized else uvicorn.config.LOGGING_CONFIG
    
    # デバッグモードの場合はリロードを有効化
    reload_enabled = debug_mode and not is_optimized
    
    try:
        uvicorn.run(
            app, 
            host="127.0.0.1",
            port=port, 
            reload=reload_enabled,
            log_level="debug" if debug_mode else "warning" if is_optimized else "info",
            access_log=debug_mode or not is_optimized,  # デバッグモードまたは非最適化モードではアクセスログを有効化
            log_config=log_config,
            timeout_keep_alive=60,
            workers=1
        )
    except Exception as e:
        logger.critical(f"アプリケーション起動中に重大なエラーが発生しました: {e}")
        logger.critical(traceback.format_exc())
        sys.exit(1)