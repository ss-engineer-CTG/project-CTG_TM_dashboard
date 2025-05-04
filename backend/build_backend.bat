@echo off
echo ===== Building Python Backend =====

REM 現在のディレクトリをスクリプトの場所に設定
cd /d "%~dp0"

REM 必要なパッケージのインストール確認
pip install -r requirements.txt
pip install pyinstaller

REM 既存のビルドディレクトリをクリーンアップ
if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

REM PyInstallerでバックエンドをビルド
pyinstaller backend.spec --clean --noconfirm

echo ===== Backend build completed =====
echo Output location: %~dp0dist\project-dashboard-backend.exe

REM 必要なファイルをコピー
echo Copying built binary to parent directory...
copy /Y dist\project-dashboard-backend.exe ..\

echo Done!