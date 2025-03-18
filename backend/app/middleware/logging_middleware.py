import time
import logging
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

# ロガー設定
logger = logging.getLogger("api")
logger.setLevel(logging.INFO)

# コンソールハンドラー
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_format = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
console_handler.setFormatter(console_format)
logger.addHandler(console_handler)

class LoggingMiddleware(BaseHTTPMiddleware):
    """
    リクエストとレスポンスをログに記録するミドルウェア
    """
    
    async def dispatch(self, request: Request, call_next):
        # リクエストID
        request_id = str(uuid.uuid4())
        
        # リクエスト情報をログに記録
        logger.info(f"Request {request_id}: {request.method} {request.url.path}")
        
        # クエリパラメータ
        if request.query_params:
            logger.info(f"Query params {request_id}: {request.query_params}")
        
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