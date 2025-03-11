"""
プロジェクト管理ダッシュボードのメインアプリケーション
"""

import logging
import dash
from dash import html, dcc, Input, Output
import os
from flask import request
import signal

from ProjectDashBoard.config import COLORS, STYLES, HTML_TEMPLATE
from ProjectDashBoard.callbacks import register_callbacks

# ログディレクトリの作成
log_dir = 'logs'
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

# ロギングの設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename=os.path.join(log_dir, 'dashboard.log')
)
logger = logging.getLogger(__name__)

# Dashアプリケーションの初期化
app = dash.Dash(__name__)
app.index_string = HTML_TEMPLATE


# アプリケーションのレイアウト
app.layout = html.Div([
    # 更新ボタン（非表示）
    html.Button('更新', id='update-button', n_clicks=0, style={'display': 'none'}),
    
    # ★★★ 追加: 初回ロード時に自動更新するためのInterval ★★★
    dcc.Interval(
        id='initial-update-interval',
        interval=1000,  # 1秒後に発火
        max_intervals=1  # 一度だけ発火
    ),
    
    # ダミー出力（コールバック用）
    html.Div(id='dummy-output', style={'display': 'none'}),
    
    # 通知コンテナ
    html.Div(id='notification-container'),
     
    # ヘッダー
    html.Div([
        html.Div([
            # 左側：タイトルと更新時間
            html.Div([
                html.H1('プロジェクト進捗ダッシュボード', 
                    style={'color': COLORS['text']['primary']}),
                html.P(id='update-time',
                    style={'color': COLORS['text']['secondary']})
            ], style={'flex': '1'}),
            
            # 右側：ファイル選択と更新コントロール
            html.Div([
                # ファイルパスを保存するStore
                dcc.Store(id='selected-file-path', storage_type='local'),
                
                # コントロールコンテナ
                html.Div([
                    # ファイル表示（小さく表示）
                    html.Div(id='selected-file-display', style={
                        'color': COLORS['text']['secondary'],
                        'fontSize': '0.8em',
                        'marginRight': '10px',
                        'maxWidth': '300px',
                        'overflow': 'hidden',
                        'textOverflow': 'ellipsis',
                        'whiteSpace': 'nowrap'
                    }),
                    
                    # コンパクトなボタングループ
                    html.Div([
                        # 参照ボタン
                        html.Button(
                            '参照',
                            id='select-file-button',
                            style={
                                'backgroundColor': 'transparent',
                                'color': COLORS['text']['accent'],
                                'padding': '6px 10px',
                                'borderRadius': '4px',
                                'border': f'1px solid {COLORS["text"]["accent"]}',
                                'cursor': 'pointer',
                                'fontSize': '0.8em',
                                'marginRight': '5px'
                            }
                        ),
                        # データ更新ボタン
                        html.Button(
                            '更新',
                            id='refresh-data-button',
                            n_clicks=0,
                            style={
                                'backgroundColor': COLORS['text']['accent'],
                                'color': COLORS['surface'],
                                'padding': '6px 10px',
                                'borderRadius': '4px',
                                'border': 'none',
                                'cursor': 'pointer',
                                'fontSize': '0.8em'
                            }
                        ),
                    ], style={'display': 'flex', 'alignItems': 'center'})
                ], style={'display': 'flex', 'alignItems': 'center', 'justifyContent': 'flex-end'})
            ], style={'flex': '0 0 auto'})
        ], style={**STYLES['container'], 'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center'})
    ], style={
        'backgroundColor': COLORS['surface'],
        'borderBottom': '1px solid rgba(255,255,255,0.1)',
        'boxShadow': '0 2px 4px rgba(0,0,0,0.2)'
    }),
    
    # メインコンテンツ
    html.Div([
        # サマリーカード
        html.Div([
            html.Div([
                html.Div([
                    html.H3('総プロジェクト数', style={'color': COLORS['text']['secondary']}),
                    html.H2(id='total-projects', style={'color': COLORS['text']['primary']})
                ], style={**STYLES['card'], 'width': '23%'}),
                html.Div([
                    html.H3('進行中', style={'color': COLORS['text']['secondary']}),
                    html.H2(id='active-projects', style={'color': COLORS['status']['info']})
                ], style={**STYLES['card'], 'width': '23%'}),
                html.Div([
                    html.H3('遅延あり', style={'color': COLORS['text']['secondary']}),
                    html.H2(id='delayed-projects', style={'color': COLORS['status']['danger']})
                ], style={**STYLES['card'], 'width': '23%'}),
                html.Div([
                    html.H3('今月のマイルストーン', style={'color': COLORS['text']['secondary']}),
                    html.H2(id='milestone-projects', style={'color': COLORS['status']['warning']})
                ], style={**STYLES['card'], 'width': '23%'})
            ], style={'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '20px'})
        ]),
        
        # プロジェクト一覧
        html.Div([
            html.H2('プロジェクト一覧', style=STYLES['header']),
            html.Div(
                html.Div(id='project-table'),
                style={
                    'overflowX': 'auto',  # 横スクロールを有効化
                    'width': '100%',
                    'maxHeight': '600px',  # 高さの制限も設定するとより使いやすくなる
                    'overflowY': 'auto'   # 縦スクロールも有効化
                }
            )
        ], style=STYLES['card']),
        
        # グラフセクション
        html.Div([
            html.Div([
                html.Div([
                    html.H2('進捗状況分布', style=STYLES['header']),
                    dcc.Graph(id='progress-distribution')
                ], style={**STYLES['card'], 'width': '48%'}),
                html.Div([
                    html.H2('プロジェクト期間分布', style=STYLES['header']),
                    dcc.Graph(id='duration-distribution')
                ], style={**STYLES['card'], 'width': '48%'})
            ], style={'display': 'flex', 'justifyContent': 'space-between'})
        ])
    ], style={'backgroundColor': COLORS['background'], 
              'padding': '20px', 
              'minHeight': '100vh'})
], style={'backgroundColor': COLORS['background']})

# シャットダウンエンドポイントを維持（外部からの終了に必要）
@app.server.route('/shutdown', methods=['POST'])
def shutdown_server():
    """サーバーをシャットダウンするエンドポイント"""
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        # Werkzeug以外のサーバーの場合
        try:
            os.kill(os.getpid(), signal.SIGTERM)
        except:
            pass
    else:
        func()
    return 'ダッシュボードサーバーを終了しています...'

# コールバックの登録
register_callbacks(app)

# アプリケーション起動
if __name__ == '__main__':
    logger.info("Starting dashboard application")
    try:
        # デバッグモードを無効化、ポートと通信設定を明示的に指定
        app.run_server(
            debug=False,  
            port=8050,
            host='127.0.0.1',
            use_reloader=False  # リローダーを無効化（PyInstallerで問題の原因になりうる）
        )
    except Exception as e:
        logger.error(f"Failed to start dashboard: {e}")
        # 標準エラー出力にも出力（親プロセスがキャプチャできるように）
        import sys
        print(f"Dashboard startup error: {e}", file=sys.stderr)