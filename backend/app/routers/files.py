from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pathlib import Path
import os
import subprocess
import platform
import sys
import logging
import tempfile
import shutil

from app.models.schemas import FilePath, FileResponse
from app.services.file_utils import validate_file_path, open_file_or_folder
from app.services.data_processing import resolve_dashboard_path

router = APIRouter()
logger = logging.getLogger("api.files")

@router.post("/files/open", response_model=FileResponse)
async def open_file(file_info: FilePath):
    """
    ファイルまたはフォルダを開く
    
    Args:
        file_info: ファイル情報
        
    Returns:
        処理結果
    """
    try:
        result = open_file_or_folder(file_info.path)
        return FileResponse(
            success=result['success'],
            message=result['message'],
            path=file_info.path if result['success'] else None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルを開くことができませんでした: {str(e)}")

@router.get("/files/default-path", response_model=FileResponse)
async def get_default_path():
    """
    デフォルトのダッシュボードファイルパスを取得
    
    Returns:
        デフォルトパス
    """
    try:
        # デフォルトパスの解決ロジック - 最適化版
        path = resolve_dashboard_path()
        if os.path.exists(path):
            return FileResponse(
                success=True,
                message="デフォルトファイルが見つかりました",
                path=path
            )
        else:
            return FileResponse(
                success=False,
                message="デフォルトファイルが見つかりません",
                path=path
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"デフォルトパスの取得に失敗しました: {str(e)}")

@router.get("/files/select", response_model=FileResponse)
async def select_file(initial_path: str = None):
    """
    ファイル選択ダイアログを表示して、選択されたファイルパスを返す
    
    Args:
        initial_path: 初期ディレクトリパス
        
    Returns:
        選択されたファイルパス
    """
    # 環境変数でtkinterのダイアログをスキップする設定
    use_electron = os.environ.get("USE_ELECTRON_DIALOG", "false").lower() == "true"
    
    if use_electron:
        # Electron環境を検出した場合、デフォルトパスのみ返す（Electron側でダイアログを表示する）
        logger.info("Electron環境検出: デフォルトパスのみ返します")
        default_path = resolve_dashboard_path()
        
        return FileResponse(
            success=True,
            message="ファイル選択にはElectronダイアログを使用してください",
            path=default_path
        )
    
    try:
        # tkinterのインポート試行
        try:
            import tkinter as tk
            from tkinter import filedialog
            
            # tkinterウィンドウを作成し、非表示にする
            root = tk.Tk()
            root.withdraw()
            
            # 初期ディレクトリの設定
            if initial_path and os.path.isdir(initial_path):
                initialdir = initial_path
            elif initial_path and os.path.isfile(initial_path):
                initialdir = str(Path(initial_path).parent)
            else:
                initialdir = os.getcwd()
            
            # ファイル選択ダイアログを表示
            file_path = filedialog.askopenfilename(
                initialdir=initialdir,
                title="ダッシュボードCSVファイルの選択",
                filetypes=(("CSV files", "*.csv"), ("All files", "*.*"))
            )
            
            # tkinterウィンドウを破棄
            root.destroy()
            
            # ファイルが選択されなかった場合
            if not file_path:
                logger.info("ファイルが選択されませんでした（キャンセルまたは閉じるがクリックされた）")
                return FileResponse(
                    success=False,
                    message="ファイルが選択されませんでした",
                    path=None
                )
            
            # 選択されたファイルパスを返す
            logger.info(f"ファイルが選択されました: {file_path}")
            return FileResponse(
                success=True,
                message=f"ファイルが選択されました: {file_path}",
                path=file_path
            )
            
        except ImportError as ie:
            # tkinterが使用できない場合のログ
            logger.error(f"tkinterのインポートエラー: {str(ie)}")
            
            # tkinterが使用できない場合はデフォルトパスを使用
            default_path = resolve_dashboard_path()
            
            logger.info(f"デフォルトパスを使用: {default_path}")
            return FileResponse(
                success=True,
                message=f"ファイル選択ダイアログが使用できないため、デフォルトパスを使用します: {default_path}",
                path=default_path
            )
            
        except Exception as e:
            # tkinter関連の他の例外
            logger.error(f"tkinterの使用中に例外が発生: {str(e)}", exc_info=True)
            
            # 例外が発生した場合でもデフォルトパスで回復を試みる
            default_path = resolve_dashboard_path()
            
            return FileResponse(
                success=True,
                message=f"ファイル選択ダイアログでエラーが発生したため、デフォルトパスを使用します: {default_path}",
                path=default_path
            )
            
    except Exception as e:
        logger.error(f"ファイル選択中にエラーが発生: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ファイル選択中にエラーが発生しました: {str(e)}")

@router.post("/files/upload", response_model=FileResponse)
async def upload_file(file: UploadFile = File(...)):
    """
    CSVファイルをアップロードし、一時ディレクトリに保存する
    
    Args:
        file: アップロードされたファイル
        
    Returns:
        保存されたファイルパス
    """
    try:
        logger.info(f"ファイルアップロード: {file.filename}")
        
        # ファイル形式確認
        if not file.filename.endswith('.csv'):
            return FileResponse(
                success=False,
                message="CSVファイルのみアップロード可能です",
                path=None
            )
        
        # 一時ディレクトリを作成
        temp_dir = Path(tempfile.gettempdir()) / "project_dashboard"
        os.makedirs(temp_dir, exist_ok=True)
        
        # ファイルパスを設定
        file_path = temp_dir / file.filename
        
        # ファイル保存
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"ファイルを保存しました: {file_path}")
        
        return FileResponse(
            success=True,
            message=f"ファイルがアップロードされました: {file.filename}",
            path=str(file_path)
        )
        
    except Exception as e:
        logger.error(f"ファイルアップロードエラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ファイルアップロード中にエラーが発生しました: {str(e)}")