# -*- mode: python ; coding: utf-8 -*-

import os
import sys

# 修正: __file__の代わりにos.getcwd()を使用
app_path = os.path.abspath(os.getcwd())
backend_path = os.path.join(app_path, 'backend')

a = Analysis(
    ['app/main.py'],
    pathex=[app_path, backend_path],
    binaries=[],
    datas=[],
    hiddenimports=[
        'fastapi',
        'uvicorn',
        'pandas',
        'numpy',
        'datetime',
        'psutil',
        'pydantic',
        'starlette',
        'app.routers.health',
        'app.routers.metrics',
        'app.routers.projects',
        'app.routers.files',
        'app.routers.system',
        'app.routers.milestones',
        'app.services.async_loader',
        'app.services.data_processing',
        'app.services.file_utils',
        'app.services.system_health',
        'app.services.crypto_utils',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='project-dashboard-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)