"""
非同期ローダーモジュール
- バックエンド起動時の重い処理を遅延/非同期で実行するためのユーティリティ
"""

import asyncio
import functools
import importlib
import logging
import sys
import time
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

async def initialize_background_tasks():
    """バックグラウンドタスクを初期化"""
    global _initialization_complete
    
    if _initialization_complete:
        logger.debug("初期化は既に完了しています")
        return
    
    # すべての初期化タスクを並列実行
    if _initialization_tasks:
        logger.info(f"{len(_initialization_tasks)}個の初期化タスクを開始します")
        start_time = time.time()
        await asyncio.gather(*_initialization_tasks)
        logger.info(f"すべての初期化タスクが完了しました ({time.time() - start_time:.2f}秒)")
    
    _initialization_complete = True


def register_init_task(coro_func):
    """初期化タスクとして関数を登録するデコレータ"""
    @functools.wraps(coro_func)
    async def wrapper(*args, **kwargs):
        return await coro_func(*args, **kwargs)
    
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
        
        _import_cache[module_name] = module
        return module
    except ImportError as e:
        logger.error(f"モジュール {module_name} のインポートに失敗: {e}")
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