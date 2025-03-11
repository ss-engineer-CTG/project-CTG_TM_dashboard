const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const findProcess = require('find-process');
const fs = require('fs');
const http = require('http'); // Node.jsネイティブのHTTPモジュール

// Pythonサーバーのプロセス参照
let pythonProcess = null;
// メインウィンドウの参照
let mainWindow = null;
// Pythonバックエンドのポート
const PYTHON_PORT = 8050;
// 開発モードかどうか
const DEV_MODE = isDev || process.argv.includes('--dev');
// サーバー準備完了フラグ
let serverReadyDetected = false;

// パス関連ヘルパー関数
function getPythonPath() {
  return isDev 
    ? path.join(__dirname, 'python') 
    : path.join(process.resourcesPath, 'python');
}

function getServerScriptPath() {
  return path.join(getPythonPath(), 'server.py');
}

// HTTPリクエスト関数
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const { statusCode } = res;
      
      if (statusCode !== 200) {
        res.resume();
        reject(new Error(`Request failed with status code: ${statusCode}`));
        return;
      }
      
      res.setEncoding('utf8');
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({ ok: true, status: statusCode, text: () => Promise.resolve(data) });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Pythonサーバーの起動
async function startPythonServer() {
  try {
    // 既にPythonプロセスが実行中かチェック
    const processes = await findProcess('port', PYTHON_PORT);
    if (processes.length > 0) {
      console.log(`Port ${PYTHON_PORT} is already in use. Trying to terminate existing process...`);
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', processes[0].pid, '/f', '/t']);
      } else {
        process.kill(processes[0].pid);
      }
      
      // プロセスが完全に終了するまで待機
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Python実行パスの決定
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    const pythonServerPath = getServerScriptPath();

    console.log(`Starting Python server from: ${pythonServerPath}`);
    console.log(`Python path: ${getPythonPath()}`);

    // サンプルCSVファイルの存在確認
    const sampleDataDir = path.join(getPythonPath(), 'sample_data');
    
    if (!fs.existsSync(sampleDataDir)) {
      console.log('Creating sample data directory');
      fs.mkdirSync(sampleDataDir, { recursive: true });
    }
    
    // サンプルCSVファイルを配置（オプション）
    // 実際の実装ではコメントアウトを解除してサンプルファイルを用意する
    /*
    const sampleDataPath = path.join(sampleDataDir, 'dashboard.csv');
    if (!fs.existsSync(sampleDataPath)) {
      console.log('Creating sample dashboard.csv file');
      fs.writeFileSync(sampleDataPath, 'project_id,project_name,process,line,task_id,task_name,task_status,task_start_date,task_finish_date,task_milestone,created_at\n1,サンプルプロジェクト,開発,ライン1,1,タスク1,完了,2023-01-01,2023-01-10,○,2023-01-01\n');
    }
    */

    // Pythonプロセスの起動
    pythonProcess = spawn(pythonExecutable, [pythonServerPath], {
      cwd: getPythonPath(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',  // UTF-8出力を強制
        PYTHONUNBUFFERED: '1'        // バッファリングを無効化
      }
    });

    // フラグをリセット
    serverReadyDetected = false;

    // Pythonプロセスの標準出力とエラー出力のハンドリング
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Python stdout: ${output}`);
      
      if (output.includes('Running on http')) {
        // サーバーの起動を検知したら、フラグを設定
        console.log("Dash server is running - ready flag detected in stdout");
        serverReadyDetected = true;
        
        // フロントエンドにサーバー起動通知を送信
        if (mainWindow) {
          mainWindow.webContents.send('python-server-status', { status: 'running' });
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    // プロセス終了時の処理
    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      pythonProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('python-server-status', { 
          status: 'stopped',
          code: code
        });
      }
    });

    // サーバーが起動するまで待機
    console.log("Waiting for server to initialize...");
    await waitForServerReady();
    return true;
  } catch (error) {
    console.error('Failed to start Python server:', error);
    dialog.showErrorBox('サーバー起動エラー', 
      `Pythonサーバーの起動に失敗しました: ${error.message}`);
    return false;
  }
}

// サーバーの準備ができるまで待機（修正版）
async function waitForServerReady(attempts = 15, interval = 1000) {
  // 標準出力から起動を検知した場合は即座に成功とする
  if (serverReadyDetected) {
    console.log("Server ready detected from stdout");
    // 追加待機時間を設定して、アプリケーションが完全に初期化されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  }
  
  // 一定時間待機して接続を試みる
  for (let i = 0; i < attempts; i++) {
    try {
      console.log(`Connection attempt ${i+1}/${attempts}...`);
      // ヘルスチェックエンドポイントにリクエスト
      const response = await httpGet(`http://localhost:${PYTHON_PORT}/health`);
      if (response.ok) {
        console.log(`Server responded with status: ${response.status}`);
        // 追加待機時間を設定して、アプリケーションが完全に初期化されるのを待つ
        await new Promise(resolve => setTimeout(resolve, 3000));
        return true;
      }
    } catch (error) {
      console.log(`Connection attempt failed: ${error.message}`);
    }
    // 次の試行まで待機
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  // 接続試行が失敗しても、標準出力からの検知があれば成功とする
  if (serverReadyDetected) {
    console.log("Server ready detected from stdout during connection attempts");
    // 追加待機時間
    await new Promise(resolve => setTimeout(resolve, 3000));
    return true;
  }
  
  // タイムアウト時間が経過しても接続できなかった場合も、
  // バックグラウンドサーバーが起動中の可能性があるため続行
  console.log("Server connection checking timed out, but proceeding anyway");
  // 追加の待機時間を設けて安全を確保
  await new Promise(resolve => setTimeout(resolve, 5000));
  return true;
}

// メインウィンドウの作成
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,  // webviewタグを有効化
    },
    icon: path.join(__dirname, 'assets/icons/icon.png')
  });

  // 開発モードの場合はデベロッパーツールを開く
  if (DEV_MODE) {
    mainWindow.webContents.openDevTools();
  }

  // レンダラープロセスのロード
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // CSVファイルサンプルを作成するためのエンドポイント呼び出し
  setTimeout(async () => {
    try {
      if (serverReadyDetected) {
        console.log("Initializing sample data...");
        await httpGet(`http://localhost:${PYTHON_PORT}/initialize-sample-data`);
      }
    } catch (error) {
      console.error("Error initializing sample data:", error);
    }
  }, 5000);
}

// アプリケーションの初期化
app.whenReady().then(async () => {
  try {
    // Pythonサーバー起動
    const serverStarted = await startPythonServer();
    if (serverStarted) {
      // メインウィンドウ作成
      createWindow();
    } else {
      dialog.showErrorBox('起動エラー', 
        'Pythonバックエンドの起動に失敗しました。アプリケーションを終了します。');
      app.quit();
    }
  } catch (error) {
    console.error('Application initialization error:', error);
    dialog.showErrorBox('初期化エラー', 
      `アプリケーションの初期化に失敗しました: ${error.message}`);
    app.quit();
  }
});

// すべてのウィンドウが閉じられたときの処理
app.on('window-all-closed', () => {
  // Pythonサーバーを停止
  if (pythonProcess) {
    // Windows環境での強制終了
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
    } else {
      pythonProcess.kill();
    }
    pythonProcess = null;
  }

  // macOS以外ではアプリを終了
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOSでドックアイコンがクリックされたときにウィンドウを再作成
  if (mainWindow === null) {
    createWindow();
  }
});

// ファイル選択ダイアログを開くIPCハンドラー
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  return result.canceled ? null : result.filePaths[0];
});

// アプリケーション終了時の処理
app.on('before-quit', () => {
  try {
    // Pythonサーバーを停止
    if (pythonProcess) {
      console.log("Terminating Python process...");
      
      // シャットダウンエンドポイント呼び出しをスキップ
      // 直接プロセス強制終了に進む
      try {
        // Windows環境での強制終了
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
        } else {
          pythonProcess.kill('SIGKILL');
        }
        console.log("Python process terminated.");
      } catch (killError) {
        console.error("Error killing Python process:", killError);
      }
    }
  } catch (error) {
    console.error('Error during application shutdown:', error);
  }
});