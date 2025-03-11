"""
ダッシュボードのUIコンポーネント生成モジュール

- テーブル、チャート、プログレスバーなどのUI要素の生成
"""

import pandas as pd
import datetime
import plotly.graph_objects as go
from dash import html

from ProjectDashBoard.config import COLORS, STYLES, GRAPH_LAYOUT
from ProjectDashBoard.file_utils import create_safe_link
from ProjectDashBoard.data_processing import (
    get_next_milestone, check_delays, next_milestone_format, 
    get_recent_tasks, get_status_color
)


def create_progress_indicator(progress: float, color: str) -> html.Div:
    """
    プログレスバーの実装
    
    Args:
        progress: 進捗率
        color: バーの色
        
    Returns:
        プログレスバーのDiv要素
    """
    return html.Div([
        html.Div(
            style={
                **STYLES['progressBar']['bar'],
                'width': f'{progress}%',
                'backgroundColor': color,
            }
        ),
        html.Div(
            f'{progress}%',
            style=STYLES['progressBar']['text']
        )
    ], style=STYLES['progressBar']['container'])


def create_project_table(df: pd.DataFrame, progress_data: pd.DataFrame) -> html.Table:
    """
    プロジェクト一覧テーブルの生成
    
    Args:
        df: 全データのデータフレーム
        progress_data: 進捗計算済みのデータフレーム
        
    Returns:
        プロジェクト一覧のテーブル要素
    """
    next_milestones = get_next_milestone(df)
    delayed_tasks = check_delays(df)
    
    rows = []
    for idx, row in progress_data.iterrows():
        has_delay = any(delayed_tasks['project_id'] == row['project_id'])
        color = get_status_color(row['progress'], has_delay)
        
        progress_indicator = create_progress_indicator(row['progress'], color)
        
        status = '遅延あり' if has_delay else '進行中' if row['progress'] < 100 else '完了'
        next_milestone = next_milestone_format(next_milestones, row['project_id'])
        task_progress = f"{row['completed_tasks']}/{row['total_tasks']}"
        
        # 直近のタスク情報を取得
        recent_tasks_content = get_recent_tasks(df, row['project_id'])
        
        # リンクボタンの生成
        links_div = html.Div([
            create_safe_link(row['project_path'], 'フォルダを開く', allow_directories=True),
            create_safe_link(row['ganttchart_path'], '工程表を開く', allow_directories=False)
        ], style={'display': 'flex', 'gap': '8px', 'justifyContent': 'center'})
        
        # ステータスセルのスタイルを設定
        status_style = {
            'padding': '10px',
            'color': COLORS['status']['danger'] if status == '遅延あり' else COLORS['text']['primary'],
            'borderBottom': '1px solid rgba(255,255,255,0.1)',
            'textAlign': 'left'
        }
        
        # 各行のセルを生成
        row_cells = [
            html.Td(row['project_name'], style={
                'padding': '10px',
                'color': COLORS['text']['primary'],
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'left',
                'minWidth': '150px'
            }),
            html.Td(row['process'], style={
                'padding': '10px',
                'color': COLORS['text']['primary'],
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'left',
                'minWidth': '100px'
            }),
            html.Td(row['line'], style={
                'padding': '10px',
                'color': COLORS['text']['primary'],
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'left',
                'minWidth': '100px'
            }),
            html.Td(progress_indicator, style={
                'padding': '10px',
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'center',
                'minWidth': '150px'
            }),
            html.Td(status, style={
                **status_style,
                'minWidth': '100px'
            }),
            html.Td(next_milestone, style={
                'padding': '10px',
                'color': COLORS['text']['primary'],
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'left',
                'minWidth': '200px'
            }),
            html.Td(task_progress, style={
                'padding': '10px',
                'color': COLORS['text']['primary'],
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'center',
                'minWidth': '100px'
            }),
            # 新しい列: 直近のタスク
            html.Td(recent_tasks_content, style={
                'padding': '10px',
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'left',
                'minWidth': '300px',
                'maxWidth': '400px'
            }),
            html.Td(links_div, style={
                'padding': '10px',
                'borderBottom': '1px solid rgba(255,255,255,0.1)',
                'textAlign': 'center',
                'minWidth': '200px',
                'whiteSpace': 'nowrap'  # ボタンが折り返されないようにする
            })
        ]
        
        rows.append(html.Tr(row_cells))
    
    return html.Table([
        html.Thead(
            html.Tr([
                html.Th(col, style={
                    'backgroundColor': COLORS['surface'],
                    'color': COLORS['text']['primary'],
                    'padding': '10px',
                    'textAlign': align,
                    'borderBottom': '1px solid rgba(255,255,255,0.1)',
                    'position': 'sticky',
                    'top': 0,
                    'zIndex': 10
                }) for col, align in zip(
                    ['プロジェクト', '工程', 'ライン', '進捗', '状態', 
                     '次のマイルストーン', 'タスク進捗', '直近のタスク', 'リンク'],
                    ['left', 'left', 'left', 'center', 'left', 
                     'left', 'center', 'left', 'center']
                )
            ])
        ),
        html.Tbody(rows)
    ], style={
        'width': '100%',
        'borderCollapse': 'collapse',
        'backgroundColor': COLORS['surface']
    })


def create_progress_distribution(progress_data: pd.DataFrame) -> go.Figure:
    """
    進捗状況の分布チャート作成
    
    Args:
        progress_data: 進捗計算済みのデータフレーム
        
    Returns:
        進捗状況分布のFigureオブジェクト
    """
    ranges = ['0-25%', '26-50%', '51-75%', '76-99%', '100%']
    counts = [
        len(progress_data[progress_data['progress'] <= 25]),
        len(progress_data[(progress_data['progress'] > 25) & (progress_data['progress'] <= 50)]),
        len(progress_data[(progress_data['progress'] > 50) & (progress_data['progress'] <= 75)]),
        len(progress_data[(progress_data['progress'] > 75) & (progress_data['progress'] < 100)]),
        len(progress_data[progress_data['progress'] == 100])
    ]
    
    colors = COLORS['chart']['primary'][:len(ranges)]
    
    fig = go.Figure(data=[go.Bar(
        x=ranges,
        y=counts,
        marker_color=colors,
        marker_line_color='rgba(255,255,255,0.2)',
        marker_line_width=1
    )])
    
    fig.update_layout(
        **GRAPH_LAYOUT,
        margin=dict(l=40, r=20, t=20, b=40),
        height=300,
        xaxis_title='進捗率',
        yaxis_title='プロジェクト数',
        showlegend=False
    )
    
    return fig


def create_duration_distribution(progress_data: pd.DataFrame) -> go.Figure:
    """
    期間分布チャート作成
    
    Args:
        progress_data: 進捗計算済みのデータフレーム
        
    Returns:
        期間分布のFigureオブジェクト
    """
    ranges = ['1ヶ月以内', '1-3ヶ月', '3-6ヶ月', '6-12ヶ月', '12ヶ月以上']
    counts = [
        len(progress_data[progress_data['duration'] <= 30]),
        len(progress_data[(progress_data['duration'] > 30) & (progress_data['duration'] <= 90)]),
        len(progress_data[(progress_data['duration'] > 90) & (progress_data['duration'] <= 180)]),
        len(progress_data[(progress_data['duration'] > 180) & (progress_data['duration'] <= 365)]),
        len(progress_data[progress_data['duration'] > 365])
    ]
    
    fig = go.Figure(data=[go.Bar(
        x=ranges,
        y=counts,
        marker_color=COLORS['chart']['primary'][1],
        marker_line_color='rgba(255,255,255,0.2)',
        marker_line_width=1
    )])
    
    fig.update_layout(
        **GRAPH_LAYOUT,
        margin=dict(l=40, r=20, t=20, b=40),
        height=300,
        xaxis_title='プロジェクト期間',
        yaxis_title='プロジェクト数',
        showlegend=False
    )
    
    return fig