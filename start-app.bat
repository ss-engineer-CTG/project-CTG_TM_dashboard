@echo off
rem UTF-8 with BOM指定で保存すること
chcp 65001 > nul

rem エコーメッセージの表示用一時ファイル
set "MSG_FILE=%TEMP%\echo_messages.txt"
echo ===== プロジェクト進捗ダッシュボード起動スクリプト ===== > "%MSG_FILE%"
echo. >> "%MSG_FILE%"
type "%MSG_FILE%"

rem 環境変数設定
set "PYTHONIOENCODING=utf-8"
set "PYTHONLEGACYWINDOWSSTDIO=1"
set "DEBUG=true"
set "API_PORT=8000"
set "EXTERNAL_BACKEND=true"      REM 重要: ElectronにバックエンドをWEBより起動させないフラグ

rem Pythonパス設定
set "PYTHONPATH=%CD%\backend"

rem ログファイルパス
set "BACKEND_LOG=%TEMP%\backend_log.txt"
set "START_ERROR_LOG=%TEMP%\startup_errors.txt"

rem ====== 既存のプロセスをクリーンアップ ======
echo 既存のバックエンドプロセスをクリーンアップしています... > "%MSG_FILE%"
type "%MSG_FILE%"

rem Python.exe を使用しているポート8000のプロセスを検索して終了
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    wmic process where processid=%%a get commandline 2>nul | findstr "python" >nul
    if not errorlevel 1 (
        echo プロセスID %%a を終了します... > "%MSG_FILE%"
        type "%MSG_FILE%"
        taskkill /F /PID %%a >nul 2>&1
    )
)

timeout /t 1 > nul

rem ====== 空きポート確認 ======
echo 利用可能なポートを確認しています... > "%MSG_FILE%"
type "%MSG_FILE%"

set "PORT_AVAILABLE=0"
set /a "API_PORT_ORIGINAL=%API_PORT%"

:check_port
netstat -an | findstr ":%API_PORT%" | findstr "LISTENING" > nul
if %errorlevel% neq 0 (
    set "PORT_AVAILABLE=1"
    echo ポート %API_PORT% は利用可能です。 > "%MSG_FILE%"
    type "%MSG_FILE%"
) else (
    set /a "API_PORT=%API_PORT%+1"
    echo ポート %API_PORT_ORIGINAL% は使用中です。ポート %API_PORT% を試します... > "%MSG_FILE%"
    type "%MSG_FILE%"
    goto check_port
)

rem ====== 仮想環境の確認とパッケージインストール ======
if exist backend\venv\Scripts\activate.bat (
    call backend\venv\Scripts\activate.bat
    echo 仮想環境を有効化しました。 > "%MSG_FILE%"
    type "%MSG_FILE%"
    
    rem psutilのインストール確認
    python -c "import psutil" 2>nul
    if errorlevel 1 (
        echo psutilモジュールをインストールしています... > "%MSG_FILE%"
        type "%MSG_FILE%"
        pip install psutil > nul 2>&1
    )
) else (
    echo 警告: 仮想環境が見つかりません。必要なパッケージがインストールされていない可能性があります。 > "%MSG_FILE%"
    type "%MSG_FILE%"
)

rem ====== API設定ファイルの作成 ======
echo APIポート設定ファイルを作成しています... > "%MSG_FILE%"
type "%MSG_FILE%"

rem APIポートとURLの情報をElectronに伝えるための設定ファイルを作成
set "CONFIG_DIR=%TEMP%\project_dashboard_config"
mkdir "%CONFIG_DIR%" 2>nul

echo {> "%CONFIG_DIR%\api_config.json"
echo   "port": %API_PORT%,>> "%CONFIG_DIR%\api_config.json"
echo   "url": "http://127.0.0.1:%API_PORT%/api",>> "%CONFIG_DIR%\api_config.json"
echo   "external_backend": true>> "%CONFIG_DIR%\api_config.json"
echo }>> "%CONFIG_DIR%\api_config.json"

rem ====== バックエンドを起動 ======
echo バックエンドサーバーを起動しています（ポート: %API_PORT%）... > "%MSG_FILE%"
type "%MSG_FILE%"

set "BACKEND_STARTED=0"
if exist "%BACKEND_LOG%" del "%BACKEND_LOG%"

rem プロセスID取得用一時ファイル
set "PID_FILE=%TEMP%\backend_pid.txt"

rem バックエンドAPI URLの記録（Electronが参照できるようにする）
if not exist "%TEMP%\project_dashboard_port.txt" (
    echo %API_PORT% > "%TEMP%\project_dashboard_port.txt"
)

rem サブプロセスとしてバックエンドを起動
start /B cmd /c "cd backend && python app\main.py %API_PORT% > "%BACKEND_LOG%" 2>&1"

rem ====== バックエンドの起動を待機 ======
echo バックエンドサーバーの起動を待機しています... > "%MSG_FILE%"
type "%MSG_FILE%"

set "MAX_WAIT=30"
set "WAIT_COUNT=0"

:wait_loop
if %WAIT_COUNT% geq %MAX_WAIT% goto :timeout
timeout /t 1 > nul
set /a "WAIT_COUNT+=1"

rem ログファイルで起動完了を確認
findstr /C:"Application startup complete" "%BACKEND_LOG%" > nul
if %errorlevel% equ 0 (
    set "BACKEND_STARTED=1"
    echo バックエンドサーバーが起動しました！（%WAIT_COUNT%秒） > "%MSG_FILE%"
    type "%MSG_FILE%"
    goto :backend_ready
)

rem 起動失敗を確認
findstr /C:"error while attempting to bind" "%BACKEND_LOG%" > nul
if %errorlevel% equ 0 (
    echo バックエンドサーバーの起動に失敗しました。ポートが使用中の可能性があります。 > "%MSG_FILE%"
    type "%MSG_FILE%"
    goto :failed
)

goto :wait_loop

:timeout
echo バックエンドサーバーの起動がタイムアウトしました。ログを確認: %BACKEND_LOG% > "%MSG_FILE%"
type "%MSG_FILE%"
goto :build_frontend

:failed
echo バックエンドサーバーの起動に失敗しました。ログを確認: %BACKEND_LOG% > "%MSG_FILE%"
type "%MSG_FILE%"
goto :build_frontend

:backend_ready
echo API URL: http://127.0.0.1:%API_PORT%/api > "%MSG_FILE%"
type "%MSG_FILE%"

rem APIの有効性確認 - 文字化け防止のため、健全性チェックメッセージを出力してから実行
echo API健全性チェックを実行中... > "%MSG_FILE%"
type "%MSG_FILE%"

rem curlを使ってAPIの健全性を確認
curl -s "http://127.0.0.1:%API_PORT%/api/health" > "%TEMP%\api_health_check.json" 2>nul
if %errorlevel% neq 0 (
    echo APIの健全性チェックに失敗しました。バックエンドが正しく起動しているか確認してください。 > "%MSG_FILE%"
    type "%MSG_FILE%"
) else (
    findstr /C:"status" "%TEMP%\api_health_check.json" > nul
    if %errorlevel% equ 0 (
        echo API健全性チェック: 成功 > "%MSG_FILE%"
        type "%MSG_FILE%"
    ) else (
        echo API健全性チェック: 応答は受信しましたが、期待した形式ではありません。 > "%MSG_FILE%"
        type "%MSG_FILE%"
    )
)

rem ====== フロントエンド環境変数設定 ======
set "ELECTRON_PORT=%API_PORT%"
set "REACT_APP_API_PORT=%API_PORT%"
set "USE_EXTERNAL_BACKEND=true"

rem ====== フロントエンドのビルド ======
:build_frontend
echo フロントエンドをビルドしています... > "%MSG_FILE%"
type "%MSG_FILE%"

call npm run build:dev

rem ====== Electronアプリを起動 ======
echo Electronアプリを起動しています... > "%MSG_FILE%"
type "%MSG_FILE%"

call npm run electron

echo. > "%MSG_FILE%"
echo 完了しました。 > "%MSG_FILE%"
type "%MSG_FILE%"

rem 一時ファイルの削除
if exist "%MSG_FILE%" del "%MSG_FILE%"
if exist "%TEMP%\api_health_check.json" del "%TEMP%\api_health_check.json"