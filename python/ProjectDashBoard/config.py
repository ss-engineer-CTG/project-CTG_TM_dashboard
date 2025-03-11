"""
プロジェクト管理ダッシュボードの設定モジュール
色やスタイルの定義を行う
"""

# カラー定義
COLORS = {
    'background': '#1a1a1a',
    'surface': '#2d2d2d',
    'text': {
        'primary': '#ffffff',
        'secondary': '#b3b3b3',
        'accent': '#60cdff'
    },
    'status': {
        'success': '#50ff96',
        'warning': '#ffeb45',
        'danger': '#ff5f5f',
        'info': '#60cdff',
        'neutral': '#c8c8c8'
    },
    'chart': {
        'primary': ['#60cdff', '#50ff96', '#ffeb45', '#ff5f5f', '#ff60d3', '#d160ff'],
        'background': 'rgba(45,45,45,0.9)'
    }
}

# スタイル定義
STYLES = {
    'card': {
        'backgroundColor': COLORS['surface'],
        'padding': '20px',
        'borderRadius': '10px',
        'boxShadow': '0 4px 6px rgba(0,0,0,0.3)',
        'marginBottom': '20px',
        'border': '1px solid rgba(255,255,255,0.1)'
    },
    'header': {
        'color': COLORS['text']['primary'],
        'marginBottom': '15px',
        'fontWeight': 'bold'
    },
    'container': {
        'maxWidth': '1200px',
        'margin': '0 auto',
        'padding': '20px'
    },
    'progressBar': {
        'container': {
            'width': '100%',
            'backgroundColor': 'rgba(255,255,255,0.1)',
            'borderRadius': '4px',
            'overflow': 'hidden',
            'height': '20px',
            'position': 'relative'
        },
        'bar': {
            'height': '100%',
            'transition': 'width 0.3s ease-in-out',
            'borderRadius': '4px'
        },
        'text': {
            'position': 'absolute',
            'top': '0',
            'left': '0',
            'width': '100%',
            'height': '100%',
            'display': 'flex',
            'alignItems': 'center',
            'justifyContent': 'center',
            'color': 'white',
            'fontSize': '12px',
            'textShadow': '1px 1px 2px rgba(0,0,0,0.5)',
            'zIndex': '1'
        }
    },
    'linkButton': {
        'backgroundColor': COLORS['surface'],
        'color': COLORS['text']['accent'],
        'padding': '6px 12px',
        'border': f'1px solid {COLORS["text"]["accent"]}',
        'borderRadius': '4px',
        'textDecoration': 'none',
        'fontSize': '12px',
        'margin': '0 4px',
        'display': 'inline-block',
        'cursor': 'pointer',
        'transition': 'all 0.3s ease'
    },
    'notification': {
        'position': 'fixed',
        'bottom': '20px',
        'right': '20px',
        'padding': '10px 20px',
        'borderRadius': '4px',
        'color': 'white',
        'zIndex': '1000',
        'transition': 'opacity 0.3s ease-in-out',
        'success': {
            'backgroundColor': COLORS['status']['success']
        },
        'error': {
            'backgroundColor': COLORS['status']['danger']
        }
    }
}

# グラフ共通レイアウト
GRAPH_LAYOUT = {
    'paper_bgcolor': 'rgba(0,0,0,0)',
    'plot_bgcolor': 'rgba(0,0,0,0)',
    'font': {'color': COLORS['text']['primary']},
    'xaxis': {
        'gridcolor': 'rgba(255,255,255,0.1)',
        'zerolinecolor': 'rgba(255,255,255,0.1)'
    },
    'yaxis': {
        'gridcolor': 'rgba(255,255,255,0.1)',
        'zerolinecolor': 'rgba(255,255,255,0.1)'
    }
}

# HTML テンプレート
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>{%title%}</title>
        {%favicon%}
        {%css%}
        <style>
            .link-button:hover {
                background-color: ''' + COLORS['text']['accent'] + ''' !important;
                color: ''' + COLORS['surface'] + ''' !important;
            }
        </style>
    </head>
    <body>
        {%app_entry%}
        <footer>
            {%config%}
            {%scripts%}
            {%renderer%}
        </footer>
    </body>
</html>
'''