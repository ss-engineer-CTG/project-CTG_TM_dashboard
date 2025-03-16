const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const waitOn = require('wait-on');
const findProcess = require('find-process');
const fs = require('fs');

// FastAPIバックエンドのプロセス
let fastApiProcess = null;
let mainWindow = null;

// FastAPIバックエンドを起動する関数
function startFastApi() {
  return new Promise((resolve, reject) => {
    // 開発環境とビルド後の環境で実行パスを変更
    const resourcesPath = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app.asar.unpacked');
    
    // プラットフォームに応じたPythonパスの設定
    let pythonPath;
    if (isDev) {
      pythonPath = 'python'; // 開発環境では環境変数のPythonを使用
    } else {
      // ビルド環境ではプラットフォームごとに適切なパスを選択
      if (process.platform === 'win32') {
        pythonPath = path.join(resourcesPath, 'backend', 'venv', 'Scripts', 'python.exe');
      } else {
        pythonPath = path.join(resourcesPath, 'backend', 'venv', 'bin', 'python');
      }
    }
    
    const scriptPath = path.join(resourcesPath, 'backend', 'app', 'main.py');
    const backendDir = path.join(resourcesPath, 'backend');

    console.log(`Starting FastAPI with: ${pythonPath} ${scriptPath}`);
    console.log(`Working directory: ${backendDir}`);

    // FastAPIプロセスを起動 - 作業ディレクトリとPYTHONPATHを明示的に設定
    fastApiProcess = spawn(pythonPath, [scriptPath], {
      stdio: 'pipe',
      detached: false,
      cwd: backendDir, // 作業ディレクトリを明示的に指定
      env: { 
        ...process.env, 
        PYTHONPATH: backendDir // Pythonのパスを設定
      }
    });

    // プロセスのログを表示
    fastApiProcess.stdout.on('data', (data) => {
      console.log(`FastAPI stdout: ${data}`);
    });

    fastApiProcess.stderr.on('data', (data) => {
      console.error(`FastAPI stderr: ${data}`);
    });

    // プロセスが終了した場合
    fastApiProcess.on('close', (code) => {
      console.log(`FastAPI process exited with code ${code}`);
      fastApiProcess = null;
    });

    // APIサーバーが起動するのを待つ
    waitOn({ resources: ['http://localhost:8000/api/health'], timeout: 10000 })
      .then(() => {
        console.log('FastAPI is running');
        resolve();
      })
      .catch((err) => {
        console.error('FastAPI failed to start', err);
        reject(err);
      });
  });
}

// メインウィンドウを作成する関数
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Next.jsアプリケーションのロード
  const url = isDev 
    ? 'http://localhost:3000' // 開発環境ではNext.jsの開発サーバーを使用
    : `file://${path.join(__dirname, '../out/index.html')}`; // ビルド後はHTMLファイルを直接使用

  mainWindow.loadURL(url);

  // 開発ツールを開く（開発環境のみ）
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// アプリケーションの起動準備が完了したとき
app.whenReady().then(async () => {
  try {
    // FastAPIの起動
    await startFastApi();

    // メインウィンドウの作成
    createWindow();
  } catch (error) {
    console.error('Application startup error:', error);
    app.quit();
  }
});

// アプリケーションが終了するとき
app.on('window-all-closed', async () => {
  // FastAPIバックエンドを終了する
  if (fastApiProcess !== null) {
    try {
      const pid = fastApiProcess.pid;
      // Windowsでは子プロセスのみを終了するため、関連プロセスも検索して終了
      const processes = await findProcess('port', 8000);
      processes.forEach(proc => {
        console.log(`Killing process on port 8000: PID ${proc.pid}`);
        process.kill(proc.pid, 'SIGTERM');
      });
    } catch (err) {
      console.error('Error killing FastAPI process:', err);
    }
  }

  // MacOSではアプリケーションが明示的に終了されるまでアクティブにする（標準的な挙動）
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリケーションのアクティベーション
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 追加のIPCハンドラ
ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});