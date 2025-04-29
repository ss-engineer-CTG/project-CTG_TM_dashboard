"""
非同期ローダーモジュール - 改善版
- バックエンド起動時の重い処理を遅延/非同期で実行するためのユーティリティ
- システム健全性モジュールと統合して初期化進捗を追跡
"""

import asyncio
import functools
import importlib
import logging
import sys
import time
import traceback
from typing import Any, Callable, Dict, List, Optional, TypeVar

# ロガー設定
logger = logging.getLogger("api.async_loader")

# 型変数
T = TypeVar('T')

# グローバルインポートキャッシュ
_import_cache: Dict[str, Any] = {}
# グローバル初期化状態
_initialization_complete = False
_initialization_tasks = []

# 健全性モジュールのインポート
try:
    from app.services.system_health import register_component_ready, set_component_error
    system_health_available = True
except ImportError:
    system_health_available = False
    logger.warning("システム健全性モジュールが使用できません - パフォーマンス監視が制限されます")

async def initialize_background_tasks():
    """バックグラウンドタスクを初期化"""
    global _initialization_complete
    
    if _initialization_complete:
        logger.debug("初期化は既に完了しています")
        return
    
    start_time = time.time()
    
    # サーバーコンポーネントの登録
    if system_health_available:
        register_component_ready("server", {
            "startup_time": time.time() - start_time
        })
    
    # すべての初期化タスクを並列実行
    if _initialization_tasks:
        logger.info(f"{len(_initialization_tasks)}個の初期化タスクを開始します")
        
        try:
            # 並列実行で高速化
            results = await asyncio.gather(*_initialization_tasks, return_exceptions=True)
            
            # エラーチェック
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"初期化タスク {i+1} が失敗しました: {result}")
                    if system_health_available:
                        set_component_error(f"init_task_{i+1}", str(result))
            
            logger.info(f"すべての初期化タスクが完了しました ({time.time() - start_time:.2f}秒)")
        except Exception as e:
            logger.error(f"初期化タスクの実行中にエラーが発生しました: {str(e)}")
            logger.error(traceback.format_exc())
            if system_health_available:
                set_component_error("async_initialization", str(e))
            return
    
    # 完了状態に設定
    _initialization_complete = True
    
    # 非同期ローダーコンポーネントの準備完了を登録
    if system_health_available:
        register_component_ready("async_loader", {
            "tasks_count": len(_initialization_tasks),
            "completion_time": time.time() - start_time
        })


def register_init_task(coro_func):
    """初期化タスクとして関数を登録するデコレータ"""
    @functools.wraps(coro_func)
    async def wrapper(*args, **kwargs):
        try:
            # 開始時間を記録
            start_time = time.time()
            # 関数を実行
            result = await coro_func(*args, **kwargs)
            # 完了時間を記録
            completion_time = time.time() - start_time
            
            # 実行時間が長い場合はログに記録
            if completion_time > 0.5:
                logger.info(f"初期化タスク '{coro_func.__name__}' が完了しました ({completion_time:.2f}秒)")
            
            return result
        except Exception as e:
            logger.error(f"初期化タスク '{coro_func.__name__}' でエラーが発生しました: {str(e)}")
            logger.error(traceback.format_exc())
            raise
    
    _initialization_tasks.append(wrapper())
    return wrapper


def lazy_import(module_name: str):
    """
    モジュールを遅延インポートする関数
    
    Args:
        module_name: インポートするモジュールの名前
        
    Returns:
        インポートされたモジュール
    """
    if module_name in _import_cache:
        return _import_cache[module_name]
    
    try:
        start_time = time.time()
        module = importlib.import_module(module_name)
        import_time = time.time() - start_time
        
        # 重いモジュールはログに記録
        if import_time > 0.1:  # 100ms以上かかったモジュールを記録
            logger.info(f"モジュール {module_name} を遅延インポート ({import_time:.2f}秒)")
            
            # システム健全性モジュールがある場合はコンポーネント登録
            if system_health_available and module_name in ['pandas', 'numpy', 'sklearn', 'matplotlib', 'tensorflow']:
                register_component_ready(module_name.split('.')[-1], {
                    "import_time": import_time,
                    "version": getattr(module, "__version__", "unknown")
                })
        
        _import_cache[module_name] = module
        return module
    except ImportError as e:
        logger.error(f"モジュール {module_name} のインポートに失敗: {e}")
        
        # システム健全性モジュールがある場合はエラー登録
        if system_health_available and module_name in ['pandas', 'numpy', 'sklearn', 'matplotlib', 'tensorflow']:
            set_component_error(module_name.split('.')[-1], str(e))
            
        raise


# pandas、numpy、datetimeなどの重いモジュールを遅延インポートする関数
def import_pandas():
    """pandasモジュールを遅延インポート"""
    return lazy_import("pandas")


def import_numpy():
    """numpyモジュールを遅延インポート"""
    return lazy_import("numpy")


def import_datetime():
    """datetimeモジュールを遅延インポート"""
    return lazy_import("datetime")


# 非同期実行を簡略化するヘルパー関数
def run_in_threadpool(func: Callable, *args, **kwargs) -> asyncio.Future:
    """
    関数をスレッドプールで実行し、非同期Future型で結果を返す
    
    Args:
        func: 実行する関数
        *args: 関数への位置引数
        **kwargs: 関数へのキーワード引数
        
    Returns:
        asyncio.Future: 関数の実行結果を持つFuture
    """
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(
        None, 
        lambda: func(*args, **kwargs)
    )


# キャッシュ用デコレータ - 非同期対応
def async_cache_result(ttl_seconds: int = 300, max_entries: int = 50):
    """
    非同期関数の結果をキャッシュするデコレータ
    
    Args:
        ttl_seconds: キャッシュの有効期間（秒）
        max_entries: キャッシュの最大エントリ数
        
    Returns:
        デコレータ関数
    """
    cache = {}
    cache_stats = {'hits': 0, 'misses': 0}
    
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # キャッシュキー作成
            key_parts = [func.__name__]
            for arg in args:
                if isinstance(arg, (str, int, float, bool)):
                    key_parts.append(str(arg))
            
            # 重要な引数のみキャッシュキーに含める
            file_path = kwargs.get('dashboard_file_path')
            if file_path:
                key_parts.append(str(file_path))
                
            cache_key = ":".join(key_parts)
            
            # キャッシュチェック
            if cache_key in cache:
                data, timestamp = cache[cache_key]
                age = time.time() - timestamp
                if age < ttl_seconds:
                    cache_stats['hits'] += 1
                    return data
            
            # キャッシュミス時は関数実行
            cache_stats['misses'] += 1
            result = await func(*args, **kwargs)
            
            # キャッシュサイズ管理
            if len(cache) >= max_entries:
                # 最も古いエントリを削除
                oldest_key = min(cache.items(), key=lambda x: x[1][1])[0]
                del cache[oldest_key]
            
            cache[cache_key] = (result, time.time())
            return result
        
        # キャッシュ状態確認用メソッドの追加
        wrapper.get_cache_stats = lambda: {
            'size': len(cache),
            'hits': cache_stats['hits'],
            'misses': cache_stats['misses'],
            'hit_ratio': cache_stats['hits'] / (cache_stats['hits'] + cache_stats['misses']) 
                        if (cache_stats['hits'] + cache_stats['misses']) > 0 else 0,
            'keys': list(cache.keys())
        }
        
        wrapper.clear_cache = lambda: cache.clear()
        
        return wrapper
    
    return decorator