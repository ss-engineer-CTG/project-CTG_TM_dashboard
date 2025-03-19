const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const waitOn = require('wait-on');
const findProcess = require('find-process');
const fs = require('fs');
const axios = require('axios');
const os = require('os');
const http = require('http');

// FastAPIバックエンドのプロセス
let fastApiProcess = null;
let mainWindow = null;
let appIsQuitting = false;

// 現在のAPIベースURL（ポート変更時に使用）
global.apiBaseUrl = 'http://localhost:8000/api';

// サーバー起動検出の状態管理
let startupDetectionState = {
  startupMessageDetected: false,
  runningMessageDetected: false,
  connectionVerified: false
};

// デバッグ情報を強化するための関数
function logSystemInfo() {
  console.log('==== システム情報 ====');
  console.log(`OS: ${os.type()} ${os.release()} (${os.platform()})`);
  console.log(`アーキテクチャ: ${os.arch()}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Electron: ${process.versions.electron}`);
  console.log(`Chrome: ${process.versions.chrome}`);
  console.log(`作業ディレクトリ: ${process.cwd()}`);
  console.log(`ユーザパス: ${app.getPath('userData')}`);
  console.log(`一時ディレクトリ: ${os.tmpdir()}`);
  console.log('=====================');
}

// ポートが使用可能か確認する関数
async function checkPortAvailability(port) {
  return new Promise(resolve => {
    const server = require('net').createServer();
    server.once('error', () => {
      resolve(false); // ポートは使用中
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // ポートは利用可能
    });
    server.listen(port, '127.0.0.1');
  });
}

// プロセスの終了を待つ関数
async function waitForProcessTermination(pids, timeout) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    let allTerminated = true;
    for (const pid of pids) {
      try {
        process.kill(pid, 0); // シグナル0で存在確認
        allTerminated = false;
        break;
      } catch (e) {
        // プロセスが存在しない - OK
      }
    }
    if (allTerminated) return true;
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms間隔でチェック
  }
  return false; // タイムアウト
}

// API利用可能性チェック関数を改善
const verifyApiConnection = async (port, maxRetries = 10) => {
  console.log(`ポート ${port} への接続を検証します (最大 ${maxRetries} 回)...`);
  
  // レスポンスメッセージとして成功と見なす文字列パターン
  const successPatterns = ['status', 'ok', 'running', 'health'];
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 方法1: fetch APIを使用した接続テスト (Node.js環境では使用不可)
      try {
        const response = await axios.get(`http://127.0.0.1:${port}/api/health`, {
          timeout: 3000,
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.status >= 200 && response.status < 300) {
          const data = response.data;
          console.log(`ヘルスチェック応答 (axios): ${JSON.stringify(data)}`);
          
          // 応答に成功パターンのいずれかが含まれているか確認
          if (typeof data === 'object' && data !== null && 
              (data.status === 'ok' || successPatterns.some(pattern => 
                JSON.stringify(data).toLowerCase().includes(pattern)))) {
            console.log(`ポート ${port} での接続が検証されました (axios)`);
            return true;
          }
        }
      } catch (e) {
        console.log(`axios確認失敗 (${i+1}/${maxRetries}): ${e.message}`);
      }
      
      // 方法2: HTTPリクエストを使用した直接接続テスト
      try {
        const result = await new Promise((resolve, reject) => {
          const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/api/health',
            method: 'HEAD',  // 軽量なヘッドリクエストを使用
            timeout: 2000,
          }, (res) => {
            // ステータスコードが2xxなら成功
            resolve(res.statusCode >= 200 && res.statusCode < 300);
          });
          
          req.on('error', (e) => reject(e));
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
          req.end();
        });
        
        if (result) {
          console.log(`ポート ${port} での接続が検証されました (HTTP リクエスト)`);
          return true;
        }
      } catch (e) {
        console.log(`HTTP確認失敗 (${i+1}/${maxRetries}): ${e.message}`);
      }
      
      // 短い待機時間を入れて再試行
      if (i < maxRetries - 1) {
        const waitTime = 500 * (i + 1);  // 徐々に待機時間を増やす
        console.log(`${waitTime}ms待機後に再試行します...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (e) {
      console.error(`検証エラー (${i+1}/${maxRetries}):`, e);
    }
  }
  
  // 最後の手段: サーバーが起動メッセージを出力していれば、
  // 接続確認に失敗してもサーバーが起動していると判断
  if (startupDetectionState.startupMessageDetected || 
      startupDetectionState.runningMessageDetected) {
    console.warn('接続確認に失敗しましたが、サーバー起動メッセージが検出されているため、起動していると判断します');
    return true;
  }
  
  console.error(`ポート ${port} への接続を検証できませんでした`);
  return false;
};

// 既存のPythonプロセスをクリーンアップする関数
async function cleanupExistingProcesses() {
  // 対象となるポートのリスト
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  let cleanedUpPids = [];
  
  console.log('既存のプロセスをチェックしています...');
  
  for (const port of ports) {
    try {
      const processes = await findProcess('port', port);
      const pythonProcesses = processes.filter(p => 
        p.name && p.name.toLowerCase().includes('python') && 
        p.cmd && (p.cmd.toLowerCase().includes('main.py') || p.cmd.toLowerCase().includes('uvicorn'))
      );
      
      if (pythonProcesses.length > 0) {
        console.log(`ポート ${port} で実行中のPythonプロセスを検出しました:`, pythonProcesses);
        
        // プロセスを終了
        for (const proc of pythonProcesses) {
          try {
            process.kill(proc.pid, 'SIGTERM');
            console.log(`PID ${proc.pid} に終了シグナルを送信しました`);
            cleanedUpPids.push(proc.pid);
          } catch (e) {
            console.error(`PID ${proc.pid} の終了に失敗しました: ${e.message}`);
          }
        }
      }
    } catch (err) {
      console.warn(`ポート ${port} のプロセス確認中にエラー: ${err.message}`);
    }
  }
  
  // 終了したプロセスの終了を待つ
  if (cleanedUpPids.length > 0) {
    console.log(`${cleanedUpPids.length}個のプロセスの終了を待っています...`);
    await waitForProcessTermination(cleanedUpPids, 5000); // 5秒待つ
    console.log('プロセスクリーンアップが完了しました');
  } else {
    console.log('クリーンアップ対象のプロセスはありませんでした');
  }
}

// プロセス使用状況の詳細を収集
async function getPortUsageDetails(ports) {
  try {
    let details = '';
    for (const port of ports) {
      const processes = await findProcess('port', port);
      if (processes.length > 0) {
        details += `ポート ${port} を使用中のプロセス:\n`;
        processes.forEach(p => {
          details += `- PID: ${p.pid}, 名前: ${p.name || '不明'}\n`;
        });
      } else {
        details += `ポート ${port} は使用されていません\n`;
      }
    }
    return details || '詳細情報を取得できませんでした';
  } catch (e) {
    return `ポート使用状況の取得中にエラーが発生しました: ${e.message}`;
  }
}

// 自己修復メカニズム - 再起動管理
let serverRestartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

// FastAPIバックエンドを起動する関数
function startFastApi() {
  return new Promise(async (resolve, reject) => {
    // リセットオブジェクト状態
    startupDetectionState = {
      startupMessageDetected: false,
      runningMessageDetected: false,
      connectionVerified: false
    };

    // システム情報のログ出力
    logSystemInfo();
    
    // 既存のプロセスをクリーンアップ
    await cleanupExistingProcesses();
    
    // 代替ポートのリストを拡大し、より多くの選択肢を提供
    const potentialPorts = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
    let selectedPort = null;
    
    // まずポートの探索をする
    for (const port of potentialPorts) {
      try {
        const isAvailable = await checkPortAvailability(port);
        if (isAvailable) {
          selectedPort = port;
          console.log(`使用可能なポート ${port} を発見しました`);
          break;
        } else {
          console.log(`ポート ${port} は使用中です。次のポートを試行します...`);
        }
      } catch (err) {
        console.warn(`ポート ${port} の確認中にエラー: ${err.message}`);
      }
    }
    
    if (!selectedPort) {
      console.error("すべてのポートが使用中です。バックエンドサーバーを起動できません。");
      reject(new Error("利用可能なポートがありません"));
      return;
    }
    
    console.log(`選択されたポート: ${selectedPort} を使用します`);
    
    // ポート情報を一時ファイルに保存
    const portFilePath = path.join(os.tmpdir(), 'project_dashboard_port.txt');
    try {
      fs.writeFileSync(portFilePath, selectedPort.toString());
      console.log(`ポート情報をファイルに保存しました: ${portFilePath}`);
    } catch (err) {
      console.warn(`ポート情報の保存に失敗: ${err.message}`);
    }

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

    console.log(`Starting FastAPI with: ${pythonPath} ${scriptPath} ${selectedPort}`);
    console.log(`Working directory: ${backendDir}`);

    // 設定可能なタイムアウト値
    const STARTUP_TIMEOUT = 60000;  // 60秒の基本タイムアウト
    const EXTENDED_TIMEOUT = 120000; // 起動メッセージ検出時の延長タイムアウト
    
    // タイムアウト管理の改善
    let timeoutExtended = false;
    
    const startupTimeout = setTimeout(() => {
      // 起動メッセージが既に検出されている場合は、タイムアウトを延長
      if ((startupDetectionState.startupMessageDetected || 
          startupDetectionState.runningMessageDetected) && 
          !timeoutExtended) {
            
        console.log('サーバー起動メッセージを検出済み。タイムアウトを延長します...');
        timeoutExtended = true;
        
        setTimeout(() => {
          handleTimeout("延長タイムアウト");
        }, EXTENDED_TIMEOUT - STARTUP_TIMEOUT);
        
      } else if (!timeoutExtended) {
        handleTimeout("通常タイムアウト");
      }
    }, STARTUP_TIMEOUT);
    
    // タイムアウト処理ハンドラー
    const handleTimeout = (type) => {
      console.error(`${type}: バックエンドサーバーの起動確認がタイムアウトしました`);
      
      // サーバーが起動メッセージを出力しているが接続確認ができていない場合
      if ((startupDetectionState.startupMessageDetected || 
          startupDetectionState.runningMessageDetected) && 
          !startupDetectionState.connectionVerified) {
        
        console.warn('サーバーは起動している可能性がありますが、接続確認ができていません。プロセスを強制終了せず、アプリケーションを続行します。');
        
        // サーバーは起動している可能性があるため、強制終了せずに続行
        global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
        resolve(selectedPort);
        return;
      }
      
      // 通常のタイムアウト処理
      if (fastApiProcess) {
        try {
          fastApiProcess.kill();
        } catch (e) {
          console.error('サーバープロセス終了エラー:', e);
        }
      }
      reject(new Error('バックエンドサーバーの起動がタイムアウトしました'));
    };

    // FastAPIプロセスを起動 - ポート番号を引数として渡す
    fastApiProcess = spawn(pythonPath, [scriptPath, selectedPort.toString()], {
      stdio: 'pipe',
      detached: false,
      cwd: backendDir, // 作業ディレクトリを明示的に指定
      env: { 
        ...process.env, 
        PYTHONPATH: backendDir, // Pythonのパスを設定
        USE_ELECTRON_DIALOG: "true", // Electron環境であることを通知
        PYTHONIOENCODING: "utf-8", // 明示的にUTF-8を指定
        PYTHONLEGACYWINDOWSSTDIO: "1", // Windowsでの標準出力エンコーディング問題対策
        ELECTRON_PORT: selectedPort.toString() // ポート情報を環境変数として渡す
      }
    });

    // バッファをUTF-8として処理
    fastApiProcess.stdout.setEncoding('utf-8');
    fastApiProcess.stderr.setEncoding('utf-8');

    // プロセスのログを表示
    fastApiProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`FastAPI stdout: ${output}`);
      
      // 個別のメッセージを監視
      if (output.includes('Application startup complete')) {
        startupDetectionState.startupMessageDetected = true;
        console.log('Application startup メッセージを検出しました');
      }
      
      if (output.includes('Uvicorn running')) {
        startupDetectionState.runningMessageDetected = true;
        console.log('Uvicorn running メッセージを検出しました');
      }
      
      // いずれかのメッセージが検出され、まだ接続確認が行われていない場合
      if ((startupDetectionState.startupMessageDetected || 
           startupDetectionState.runningMessageDetected) && 
          !startupDetectionState.connectionVerified) {
        
        // 重複実行を防止
        startupDetectionState.connectionVerified = true;
        
        // サーバー起動後、接続確認
        setTimeout(async () => {
          try {
            console.log('サーバー起動を検出しました。接続確認を開始します...');
            const isConnected = await verifyApiConnection(selectedPort, 15);
            
            if (isConnected) {
              clearTimeout(startupTimeout);
              console.log(`FastAPIサーバーがポート ${selectedPort} で起動し、接続も確認できました`);
              global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
              resolve(selectedPort);
            } else {
              // エラーではなく警告として処理
              console.warn('警告: サーバー起動は検出されましたが、接続確認に失敗しました。アプリケーションを続行します。');
              clearTimeout(startupTimeout);
              global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
              resolve(selectedPort);
            }
          } catch (err) {
            console.error('接続確認中にエラーが発生:', err);
            clearTimeout(startupTimeout);
            global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
            resolve(selectedPort);
          }
        }, 2000);
      }
    });

    fastApiProcess.stderr.on('data', (data) => {
      console.error(`FastAPI stderr: ${data}`);
      
      // エラー出力にも起動成功メッセージがある場合があるので確認
      if (data.includes('Application startup complete')) {
        startupDetectionState.startupMessageDetected = true;
        console.log('STDERR: Application startup メッセージを検出しました');
      }
      
      if (data.includes('Uvicorn running')) {
        startupDetectionState.runningMessageDetected = true;
        console.log('STDERR: Uvicorn running メッセージを検出しました');
      }

      // stderr からも同様に起動検出を行う
      if ((startupDetectionState.startupMessageDetected || 
           startupDetectionState.runningMessageDetected) && 
          !startupDetectionState.connectionVerified) {
        
        startupDetectionState.connectionVerified = true;
        
        setTimeout(async () => {
          try {
            console.log('STDERR: サーバー起動を検出しました。接続確認を開始します...');
            const isConnected = await verifyApiConnection(selectedPort, 15);
            
            if (isConnected) {
              clearTimeout(startupTimeout);
              console.log(`FastAPIサーバーがポート ${selectedPort} で起動し、接続も確認できました`);
              global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
              resolve(selectedPort);
            } else {
              console.warn('警告: サーバー起動は検出されましたが、接続確認に失敗しました。アプリケーションを続行します。');
              clearTimeout(startupTimeout);
              global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
              resolve(selectedPort);
            }
          } catch (err) {
            console.error('接続確認中にエラーが発生:', err);
            clearTimeout(startupTimeout);
            global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
            resolve(selectedPort);
          }
        }, 2000);
      }
    });

    // エラーハンドリング強化
    fastApiProcess.on('error', (err) => {
      clearTimeout(startupTimeout);
      console.error('バックエンドプロセス起動エラー:', err);
      reject(err);
    });

    // プロセス終了時のハンドリング強化
    fastApiProcess.on('close', (code) => {
      console.log(`FastAPI process exited with code ${code}`);
      
      // 成功フラグが立っていれば、プロセス終了は無視
      if (startupDetectionState.connectionVerified) {
        console.log('サーバー接続が既に確認されているため、プロセス終了は無視します');
        return;
      }
      
      // サーバーが正常に起動した後に終了した場合
      if (startupDetectionState.startupMessageDetected || 
          startupDetectionState.runningMessageDetected) {
        
        console.warn('FastAPIサーバーが予期せず終了しました。コード:', code);
        
        // この段階でresolveかrejectが既に呼ばれているはず
      } else {
        // サーバーが起動前に終了した場合
        clearTimeout(startupTimeout);
        reject(new Error(`FastAPIサーバーの起動に失敗しました。終了コード: ${code}`));
      }
      
      fastApiProcess = null;
    });

    // サーバー起動メッセージ検出がなかった場合のフォールバック
    setTimeout(async () => {
      // まだ起動確認されていない場合
      if (!startupDetectionState.connectionVerified) {
        console.log('サーバー起動メッセージが検出されませんでした。直接接続確認を試みます...');
        try {
          const isConnected = await verifyApiConnection(selectedPort, 5);
          if (isConnected) {
            startupDetectionState.connectionVerified = true;
            clearTimeout(startupTimeout);
            console.log(`FastAPIサーバーへの接続に成功しました (起動メッセージなし)`);
            global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
            resolve(selectedPort);
          } else {
            // 接続確認失敗 - ただしサーバーが起動中かもしれないので少し待つ
            console.warn('最初の接続確認に失敗しました。さらに待機します...');
          }
        } catch (err) {
          console.error('接続確認中にエラーが発生:', err);
        }
      }
    }, 10000); // 10秒後に確認
  });
}

// 自己修復メカニズムのセットアップ
function setupSelfHealing() {
  if (!fastApiProcess) return;
  
  fastApiProcess.on('exit', async (code) => {
    // サーバーがまだ必要で、強制終了されていない場合
    if (!appIsQuitting && serverRestartAttempts < MAX_RESTART_ATTEMPTS) {
      serverRestartAttempts++;
      console.log(`FastAPIサーバーが終了しました (コード: ${code})。再起動を試みます (${serverRestartAttempts}/${MAX_RESTART_ATTEMPTS})`);
      
      try {
        // 少し待機してから再起動
        await new Promise(resolve => setTimeout(resolve, 2000));
        const newPort = await startFastApi();
        console.log(`FastAPIサーバーが新しいポート ${newPort} で再起動されました`);
        
        // 再起動に成功したことをレンダラープロセスに通知
        if (mainWindow) {
          mainWindow.webContents.send('api-server-restarted', {
            port: newPort,
            apiUrl: `http://127.0.0.1:${newPort}/api`
          });
        }
      } catch (err) {
        console.error('FastAPIサーバーの再起動に失敗しました:', err);
        // 最終再起動の失敗時にユーザーに通知
        if (serverRestartAttempts >= MAX_RESTART_ATTEMPTS && mainWindow) {
          dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'サーバー再起動エラー',
            message: 'バックエンドサーバーの再起動に失敗しました',
            detail: '続行するにはアプリケーションを手動で再起動してください。',
            buttons: ['了解']
          });
        }
      }
    }
  });
}

// API健全性のモニタリング
function startApiHealthMonitoring(port) {
  const healthCheckInterval = setInterval(async () => {
    try {
      // GET メソッドを明示的に使用
      const response = await axios({
        method: 'GET',
        url: `http://127.0.0.1:${port}/api/health`,
        timeout: 2000,
        headers: { 'Accept': 'application/json' }
      });
      
      // ヘルスチェック成功
      if (response.status === 200) {
        console.log('APIサーバー健全性チェック: OK');
      }
    } catch (error) {
      console.error('APIサーバー健全性チェック失敗:', error);
      
      // APIサーバーが反応しない場合、ユーザーに通知
      if (mainWindow) {
        mainWindow.webContents.send('api-server-down', {
          message: 'バックエンドサーバーが応答していません。アプリケーションを再起動してください。'
        });
      }
    }
  }, 30000); // 30秒ごとにチェック
  
  // アプリケーション終了時にインターバルをクリア
  app.on('will-quit', () => {
    clearInterval(healthCheckInterval);
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

// ポート検出関数
async function detectAvailablePort() {
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  
  // 一時ファイルからポート読み取り試行
  const portFilePath = path.join(os.tmpdir(), 'project_dashboard_port.txt');
  if (fs.existsSync(portFilePath)) {
    try {
      const portData = fs.readFileSync(portFilePath, 'utf8');
      const port = parseInt(portData.trim(), 10);
      if (!isNaN(port) && port > 0) {
        console.log(`一時ファイルからポート検出: ${port}`);
        return port;
      }
    } catch (err) {
      console.warn('ポートファイル読み取りエラー:', err);
    }
  }
  
  // 各ポートを試行
  for (const port of ports) {
    try {
      // そのポートに何かが応答するか確認
      const inUse = !(await checkPortAvailability(port));
      if (inUse) {
        // ポートが使用中 - APIサーバーの可能性がある
        try {
          const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/api/health',
            method: 'GET',
            timeout: 1000
          });
          
          req.on('error', () => {});
          req.end();
          
          // ここでエラーが発生しなければ応答がある
          console.log(`ポート ${port} で応答を検出`);
          return port;
        } catch (e) {
          console.log(`ポート ${port} は使用中だが応答なし`);
        }
      }
    } catch (err) {
      console.warn(`ポート ${port} 検出エラー:`, err);
    }
  }
  
  return null; // 検出できなかった
}

// アプリケーションの起動準備が完了したとき
app.whenReady().then(async () => {
  try {
    // FastAPIの起動
    const port = await startFastApi();
    console.log(`FastAPIサーバーがポート ${port} で起動しました`);

    // 自己修復メカニズムの設定
    setupSelfHealing();

    // メインウィンドウの作成
    createWindow();
    
    // 接続状態のポーリングを開始
    startApiHealthMonitoring(port);
  } catch (error) {
    console.error('Application startup error:', error);
    
    // エラーがタイムアウトのみの場合、サーバーが実際には動いているかも
    if (error.message.includes('タイムアウト') || 
        error.message.includes('接続を検証できませんでした')) {
      
      // 改善: より役立つエラーメッセージと選択肢を提供
      const choice = await dialog.showMessageBox({
        type: 'warning',
        title: 'バックエンドサーバー接続警告',
        message: 'バックエンドサーバーが起動している可能性がありますが、接続を確認できませんでした。',
        detail: '続行するか、アプリケーションを終了するか選択してください。\n\n' +
                '続行を選択すると、接続が確立されるまで自動的に再試行します。',
        buttons: ['続行する', 'アプリケーションを終了する'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (choice.response === 0) {
        // 続行を選択: メインウィンドウを作成して、バックグラウンドで接続を試行
        createWindow();
        
        // バックグラウンドで接続を定期的に試行
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(async () => {
          retryCount++;
          console.log(`バックグラウンド接続試行 ${retryCount}/${maxRetries}`);
          
          try {
            // ポートの検出試行
            const detectedPort = await detectAvailablePort();
            if (detectedPort) {
              console.log(`使用中のポートを検出: ${detectedPort}`);
              global.apiBaseUrl = `http://127.0.0.1:${detectedPort}/api`;
              
              // 接続確認
              const isConnected = await verifyApiConnection(detectedPort, 3);
              if (isConnected) {
                console.log(`バックグラウンド接続成功: ポート ${detectedPort}`);
                clearInterval(retryInterval);
                
                // メインウィンドウが存在する場合は通知
                if (mainWindow) {
                  mainWindow.webContents.send('api-connection-established', {
                    port: detectedPort,
                    apiUrl: global.apiBaseUrl
                  });
                }
              }
            }
          } catch (err) {
            console.error('バックグラウンド接続エラー:', err);
          }
          
          // 最大試行回数に達したら終了
          if (retryCount >= maxRetries) {
            clearInterval(retryInterval);
            console.warn('バックグラウンド接続試行を終了します');
          }
        }, 10000); // 10秒ごとに試行
        
        return; // アプリケーションを終了しない
      }
      // else: アプリケーションを終了する（以下のコードに進む）
    }
    
    // その他のエラーの場合、カスタムエラーダイアログを表示
    const processDetails = await getPortUsageDetails([8000, 8080, 8888]);
    
    dialog.showErrorBox(
      'アプリケーション起動エラー',
      'バックエンドサーバーの起動に問題が発生しました。\n\n' +
      '考えられる原因:\n' +
      '1. 必要なポートが使用中です\n' +
      '2. Pythonの環境設定に問題があります\n' +
      '3. ファイアウォールがポートをブロックしています\n\n' +
      '解決方法:\n' +
      '1. アプリケーションを再起動する\n' +
      '2. タスクマネージャーでPythonプロセスを終了する\n' +
      '3. ファイアウォール設定を確認する\n\n' +
      '診断情報:\n' +
      `エラー: ${error.message}\n` +
      `ポート状態:\n${processDetails}`
    );
    
    app.quit();
  }
});

// アプリケーションが終了するとき
app.on('window-all-closed', async () => {
  appIsQuitting = true;
  
  // FastAPIバックエンドを終了する
  if (fastApiProcess !== null) {
    try {
      console.log('FastAPIバックエンドの終了を試みています...');
      
      // まずAPIエンドポイントで正常終了を試みる
      try {
        const apiUrl = global.apiBaseUrl || 'http://localhost:8000/api';
        await axios.post(`${apiUrl}/shutdown`, {
          timeout: 2000
        });
        console.log('シャットダウンAPIコールに成功しました');
        
        // 少し待機してプロセスが終了するのを待つ
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn('シャットダウンAPIコールに失敗しました:', error);
      }
      
      // プロセスがまだ実行中の場合は強制終了
      if (fastApiProcess && !fastApiProcess.killed) {
        console.log(`FastAPIプロセス(PID: ${fastApiProcess.pid})を終了します`);
        
        // Windowsでは子プロセスのみを終了するため、関連プロセスも検索して終了
        const port = global.apiBaseUrl ? parseInt(global.apiBaseUrl.split(':')[2]) : 8000;
        const processes = await findProcess('port', port);
        if (processes.length > 0) {
          console.log(`ポート${port}で実行中のプロセスを検出: ${processes.length}個`);
          processes.forEach(proc => {
            console.log(`プロセスを終了します: PID ${proc.pid}`);
            try {
              process.kill(proc.pid, 'SIGTERM');
            } catch (e) {
              console.error(`PID ${proc.pid}の終了に失敗:`, e);
            }
          });
        } else {
          // 通常のプロセス終了
          fastApiProcess.kill();
        }
        
        console.log('FastAPIプロセスの終了を完了しました');
      }
      
      // ポート情報ファイルの削除を試みる
      try {
        const portFilePath = path.join(os.tmpdir(), 'project_dashboard_port.txt');
        if (fs.existsSync(portFilePath)) {
          fs.unlinkSync(portFilePath);
          console.log('ポート情報ファイルを削除しました');
        }
      } catch (e) {
        console.warn('ポート情報ファイルの削除に失敗:', e);
      }
    } catch (err) {
      console.error('FastAPIプロセス終了中のエラー:', err);
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

// APIベースURLを取得するハンドラを追加
ipcMain.handle('get-api-base-url', () => {
  return global.apiBaseUrl;
});

// 一時ディレクトリのパスを取得するハンドラを追加
ipcMain.handle('get-temp-path', () => {
  return os.tmpdir();
});

// ファイル選択ダイアログのIPC処理
ipcMain.handle('dialog:openCSVFile', async (event, defaultPath) => {
  const mainWindow = BrowserWindow.getFocusedWindow();
  
  try {
    console.log(`ファイル選択ダイアログを表示します。デフォルトパス: ${defaultPath || '未指定'}`);
    
    // デフォルトパスの設定
    let dialogOptions = {
      title: 'ダッシュボードCSVファイルの選択',
      filters: [
        { name: 'CSVファイル', extensions: ['csv'] },
        { name: 'すべてのファイル', extensions: ['*'] }
      ],
      properties: ['openFile']
    };
    
    // デフォルトパスの設定（安全に処理）
    if (defaultPath) {
      try {
        const resolvedPath = path.resolve(defaultPath);
        // ファイルが存在するか確認
        if (fs.existsSync(resolvedPath)) {
          const stats = fs.statSync(resolvedPath);
          if (stats.isDirectory()) {
            dialogOptions.defaultPath = resolvedPath;
          } else {
            dialogOptions.defaultPath = path.dirname(resolvedPath);
          }
        } else {
          // パスが存在しない場合はデフォルトのドキュメントフォルダを使用
          dialogOptions.defaultPath = app.getPath('documents');
        }
      } catch (err) {
        console.error(`パス解決エラー: ${defaultPath}`, err);
        dialogOptions.defaultPath = app.getPath('documents');
      }
    } else {
      dialogOptions.defaultPath = app.getPath('documents');
    }
    
    // ダイアログ表示
    const result = await dialog.showOpenDialog(mainWindow, dialogOptions);
    
    if (result.canceled) {
      return { 
        success: false, 
        message: 'ファイル選択がキャンセルされました', 
        path: null 
      };
    }
    
    // 選択されたファイルが存在するか確認
    const selectedFile = result.filePaths[0];
    if (!fs.existsSync(selectedFile)) {
      return { 
        success: false, 
        message: '選択されたファイルが見つかりません', 
        path: null 
      };
    }
    
    return { 
      success: true, 
      message: 'ファイルが選択されました', 
      path: selectedFile 
    };
  } catch (error) {
    console.error('ファイルダイアログエラー:', error);
    return { 
      success: false, 
      message: `エラーが発生しました: ${error.message}`, 
      path: null 
    };
  }
});