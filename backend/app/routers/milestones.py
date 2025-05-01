from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
import logging
from enum import Enum
from datetime import datetime

from app.models.schemas import Project, Milestone, MilestoneStatus, MilestoneTimelineResponse
from app.services.data_processing import (
    async_load_and_process_data, get_project_milestones,
    update_milestone, create_milestone, delete_milestone
)

router = APIRouter()
logger = logging.getLogger("api.milestones")

@router.get("/milestones", response_model=List[Milestone])
async def get_milestones(file_path: str = Query(None), project_id: Optional[str] = None):
    """
    マイルストーン一覧を取得する
    
    Args:
        file_path: データファイルのパス（指定がない場合はデフォルト）
        project_id: 絞り込み用プロジェクトID（オプション）
        
    Returns:
        マイルストーン一覧
    """
    try:
        # データの読み込みと処理
        df = await async_load_and_process_data(file_path)
        
        # マイルストーン情報を取得（非同期で）
        from app.services.data_processing import async_get_project_milestones
        milestones = await async_get_project_milestones(df, project_id)
        
        # ログ出力
        logger.info(f"マイルストーン取得: {len(milestones)}件 (project_id: {project_id})")
        
        return milestones
        
    except Exception as e:
        logger.error(f"マイルストーン取得エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"マイルストーンの取得に失敗しました: {str(e)}")

@router.get("/milestones/timeline", response_model=MilestoneTimelineResponse)
async def get_milestone_timeline(file_path: str = Query(None)):
    """
    タイムライン表示用のマイルストーン一覧を取得する
    
    Args:
        file_path: データファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        プロジェクトとそれに関連するマイルストーンの一覧
    """
    try:
        # データの読み込みと処理
        df = await async_load_and_process_data(file_path)
        
        # プロジェクトデータ取得（既存の関数を利用）
        from app.routers.projects import get_projects
        projects = await get_projects(file_path)
        
        # 各プロジェクトにマイルストーン情報を追加
        for project in projects:
            project_id = project.project_id
            # 非同期でマイルストーン情報を取得
            from app.services.data_processing import async_get_project_milestones
            milestones = await async_get_project_milestones(df, project_id)
            project.milestones = milestones
        
        # ログ出力
        logger.info(f"タイムラインデータ取得: {len(projects)}件のプロジェクトと関連マイルストーン")
        
        return MilestoneTimelineResponse(projects=projects)
        
    except Exception as e:
        logger.error(f"タイムラインデータ取得エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"タイムラインデータの取得に失敗しました: {str(e)}")

@router.post("/milestones", response_model=Milestone)
async def create_new_milestone(milestone: Milestone, file_path: str = Query(None)):
    """
    新しいマイルストーンを作成する
    
    Args:
        milestone: マイルストーン情報
        file_path: データファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        作成されたマイルストーン
    """
    try:
        result = await create_milestone(milestone, file_path)
        logger.info(f"マイルストーン作成: {milestone.id} (project_id: {milestone.project_id})")
        return result
    except Exception as e:
        logger.error(f"マイルストーン作成エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"マイルストーンの作成に失敗しました: {str(e)}")

@router.put("/milestones/{milestone_id}", response_model=Milestone)
async def update_existing_milestone(milestone_id: str, milestone: Milestone, file_path: str = Query(None)):
    """
    既存のマイルストーンを更新する
    
    Args:
        milestone_id: マイルストーンID
        milestone: 更新するマイルストーン情報
        file_path: データファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        更新されたマイルストーン
    """
    try:
        # IDの整合性チェック
        if milestone_id != milestone.id:
            raise HTTPException(status_code=400, detail=f"パスのマイルストーンID({milestone_id})とボディのマイルストーンID({milestone.id})が一致しません")
            
        result = await update_milestone(milestone_id, milestone, file_path)
        logger.info(f"マイルストーン更新: {milestone_id} (project_id: {milestone.project_id})")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"マイルストーン更新エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"マイルストーンの更新に失敗しました: {str(e)}")

@router.delete("/milestones/{milestone_id}", response_model=dict)
async def delete_existing_milestone(milestone_id: str, file_path: str = Query(None)):
    """
    マイルストーンを削除する
    
    Args:
        milestone_id: マイルストーンID
        file_path: データファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        削除結果
    """
    try:
        result = await delete_milestone(milestone_id, file_path)
        logger.info(f"マイルストーン削除: {milestone_id}")
        return {"success": True, "message": "マイルストーンが削除されました"}
    except Exception as e:
        logger.error(f"マイルストーン削除エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"マイルストーンの削除に失敗しました: {str(e)}")

@router.get("/milestones/{milestone_id}", response_model=Milestone)
async def get_milestone(milestone_id: str, file_path: str = Query(None)):
    """
    マイルストーンの詳細を取得する
    
    Args:
        milestone_id: マイルストーンID
        file_path: データファイルのパス（指定がない場合はデフォルト）
        
    Returns:
        マイルストーン情報
    """
    try:
        # データの読み込みと処理
        df = await async_load_and_process_data(file_path)
        
        # マイルストーン一覧を取得
        from app.services.data_processing import async_get_project_milestones
        milestones = await async_get_project_milestones(df)
        
        # 指定されたIDのマイルストーンを検索
        for milestone in milestones:
            if milestone.id == milestone_id:
                return milestone
                
        # 見つからない場合は404エラー
        raise HTTPException(status_code=404, detail=f"マイルストーンが見つかりません: {milestone_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"マイルストーン取得エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"マイルストーンの取得に失敗しました: {str(e)}")