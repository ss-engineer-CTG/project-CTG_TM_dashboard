@echo off
REM Project Environment Setup Script

echo ===== Starting Project Environment Setup =====

REM Get current directory
set "CURRENT_DIR=%cd%"
echo Current Directory: %CURRENT_DIR%

REM Set project root directory
cd ..
set "PROJECT_ROOT=%cd%"
cd %CURRENT_DIR%
echo Project Root Directory: %PROJECT_ROOT%

REM Check data directory
set "DATA_DIR=%PROJECT_ROOT%\data\exports"
if not exist "%DATA_DIR%" (
  echo [WARNING] Data directory not found: %DATA_DIR%
  echo [INFO] Creating data directory
  mkdir "%DATA_DIR%"
)

REM Check dashboard file
set "DASHBOARD_FILE=%DATA_DIR%\dashboard.csv"
if not exist "%DASHBOARD_FILE%" (
  echo [WARNING] Dashboard CSV file not found: %DASHBOARD_FILE%
) else (
  echo [INFO] Dashboard CSV file found: %DASHBOARD_FILE%
)

REM Set environment variables
set "PMSUITE_DASHBOARD_FILE=%DASHBOARD_FILE%"
set "APP_PATH=%PROJECT_ROOT%"

echo Environment variable PMSUITE_DASHBOARD_FILE = %PMSUITE_DASHBOARD_FILE%
echo Environment variable APP_PATH = %APP_PATH%

echo.
echo ===== Environment Setup Complete =====
echo.
echo Start the backend server with the following commands:
echo cd %CURRENT_DIR%
echo python app/main.py
echo.
echo Start the frontend in a separate terminal window:
echo cd %PROJECT_ROOT%/frontend
echo npm run dev
echo.
echo.

REM Check if backend server should be started automatically
set /p START_BACKEND="Start the backend server now? (y/n): "
if /i "%START_BACKEND%"=="y" (
  echo Starting backend server...
  python app/main.py
) else (
  echo Backend server startup skipped.
  echo To start manually, run 'python app/main.py'.
)