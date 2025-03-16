from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pathlib import Path
import os
import subprocess
import platform
import sys

from app.models.schemas import FilePath, FileResponse
from app.services.file_utils import validate_file_path, open_file_or_folder

router = APIRouter()

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
        # デフォルトパスの解決ロジック
        from app.services.data_processing import resolve_dashboard_path
        
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
    try:
        # tkinterのインポートをここで行い、失敗した場合のフォールバック処理を追加
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
                return FileResponse(
                    success=False,
                    message="ファイルが選択されませんでした",
                    path=None
                )
            
            # 選択されたファイルパスを返す
            return FileResponse(
                success=True,
                message=f"ファイルが選択されました: {file_path}",
                path=file_path
            )
            
        except ImportError:
            # tkinterが使用できない場合はデフォルトパスを使用
            from app.services.data_processing import resolve_dashboard_path
            default_path = resolve_dashboard_path()
            
            return FileResponse(
                success=True,
                message=f"ファイル選択ダイアログが使用できないため、デフォルトパスを使用します: {default_path}",
                path=default_path
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイル選択中にエラーが発生しました: {str(e)}")