const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
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
let splashWindow = null;
let appIsQuitting = false;

// 現在のAPIベースURL（ポート変更時に使用）
global.apiBaseUrl = 'http://127.0.0.1:8000/api';

// サーバー起動検出の状態管理
let startupDetectionState = {
  startupMessageDetected: false,
  runningMessageDetected: false,
  connectionVerified: false
};

// 起動パフォーマンス計測
const performanceMetrics = {
  appStartTime: Date.now(),
  stages: []
};

// パフォーマンスステージの記録
function recordPerformanceStage(stageName) {
  /*パフォーマンスステージを記録*/
  performanceMetrics.stages.push({
    name: stageName,
    time: Date.now() - performanceMetrics.appStartTime
  });
  
  // 最適化モードのみログ出力
  if (os.environ && os.environ.get && os.environ.get('FASTAPI_STARTUP_OPTIMIZE') == '1') {
    console.log(`PERF: ${stageName} - ${(Date.now() - performanceMetrics.appStartTime) / 1000}s`);
  }
}

// 初期化フェーズを記録
recordPerformanceStage('init_start');

// プラットフォーム固有の最適化を設定 - 先行処理
const setupPlatformOptimizations = () => {
  if (process.platform === 'win32') {
    // Windowsの最適化
    app.setAppUserModelId('com.company.project-dashboard');
    
    // ハイパフォーマンスモードを要求
    if (app.isPackaged) {
      app.commandLine.appendSwitch('high-dpi-support', '1');
      app.commandLine.appendSwitch('force-device-scale-factor', '1');
    }
  } else if (process.platform === 'darwin') {
    // macOSの最適化
    app.dock?.setIcon(path.join(__dirname, '../frontend/public/icon.png'));
  }
  
  // 共通の最適化
  if (app.isPackaged) {
    app.commandLine.appendSwitch('disable-http-cache', 'false'); // HTTPキャッシュを有効
    app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512'); // メモリ制限を設定
    app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization'); // ハードウェアアクセラレーション
    app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors,TranslateUI'); // 不要な機能を無効化
  }

  // V8エンジンの最適化
  app.commandLine.appendSwitch('js-flags', '--expose-gc,--max-old-space-size=512');
  
  // GPUアクセラレーションの設定
  app.commandLine.appendSwitch('enable-accelerated-video-decode');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  
  // プリロード用バッファ
  app.commandLine.appendSwitch('--disk-cache-size=104857600'); // 100MB
  
  recordPerformanceStage('platform_optimizations');
}

// 並列ポート検出（高速化）
async function detectPortsInParallel(ports) {
  // 同時に複数ポートをチェック（Promise.allSettled使用）
  const results = await Promise.allSettled(
    ports.map(async port => {
      try {
        const isAvailable = await checkPortAvailability(port, 1000); // タイムアウト延長：200ms→1000ms
        return { port, available: isAvailable };
      } catch (e) {
        return { port, available: false };
      }
    })
  );
  
  // 利用可能なポートを抽出
  const availablePorts = results
    .filter(result => result.status === 'fulfilled' && result.value.available)
    .map(result => result.value.port);
    
  return availablePorts.length > 0 ? availablePorts[0] : null;
}

// ポートが使用可能か確認する関数（高速化）
async function checkPortAvailability(port, timeout = 1000) { // タイムアウト延長：500ms→1000ms
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
    
    // タイムアウト処理
    setTimeout(() => {
      try {
        server.close();
      } catch (e) {}
      resolve(false);
    }, timeout);
  });
}

// サーバー情報永続化関連の機能
function saveServerInfo(port) {
  const serverInfoPath = path.join(app.getPath('userData'), 'server-info.json');
  const serverInfo = {
    port: port,
    timestamp: Date.now(),
    version: app.getVersion()
  };
  
  try {
    fs.writeFileSync(serverInfoPath, JSON.stringify(serverInfo));
  } catch (e) {
    console.warn('サーバー情報の保存に失敗:', e);
  }
}

// 前回使用したサーバーを検出 - 高速化
async function checkPreviousServer() {
  try {
    const serverInfoPath = path.join(app.getPath('userData'), 'server-info.json');
    if (!fs.existsSync(serverInfoPath)) return null;
    
    const serverInfo = JSON.parse(fs.readFileSync(serverInfoPath, 'utf8'));
    
    // 12時間以内のサーバー情報のみ有効
    if (Date.now() - serverInfo.timestamp > 12 * 60 * 60 * 1000) {
      return null;
    }
    
    // サーバーが実際に動作しているか確認 - 厳密な検証は後回し
    const isRunning = await verifyApiConnection(serverInfo.port, 3); // リトライ回数増加: 1→3
    
    if (isRunning) {
      recordPerformanceStage('previous_server_detected');
      return serverInfo.port;
    }
  } catch (e) {}
  return null;
}

// API利用可能性チェック関数（最適化版）
const verifyApiConnection = async (port, maxRetries = 5) => { // リトライ回数増加: 2→5
  // 並列チェック用の短縮バージョン
  const quickCheck = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500); // タイムアウト延長: 500ms→1500ms
      
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        method: 'HEAD',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.status >= 200 && response.status < 300;
    } catch (e) {
      return false;
    }
  };
  
  // すぐに応答があるか確認
  if (await quickCheck()) {
    return true;
  }
  
  // 詳細なチェック
  for (let i = 0; i < maxRetries; i++) {
    try {
      // axios経由でAPI確認
      try {
        const response = await axios.get(`http://127.0.0.1:${port}/api/health`, {
          timeout: 2000, // タイムアウト延長: 1000ms→2000ms
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.status >= 200 && response.status < 300) {
          return true;
        }
      } catch (e) {
        // エラーは無視して次のチェックへ
      }
      
      // 短い待機時間
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 待機時間延長: 300ms→500ms
      }
    } catch (e) {}
  }
  
  // 最終確認：起動メッセージ検出
  if (startupDetectionState.startupMessageDetected || 
      startupDetectionState.runningMessageDetected) {
    return true;
  }
  
  return false;
};

// 既存のPythonプロセスをクリーンアップする関数（最適化）
async function cleanupExistingProcesses() {
  // 対象となるポートのリスト
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  let cleanedUpPids = [];
  
  console.log('既存のPythonプロセスをクリーンアップしています...');
  
  // ポート検索を並列実行
  const portChecks = await Promise.allSettled(
    ports.map(async port => {
      try {
        const processes = await findProcess('port', port);
        return { port, processes };
      } catch (err) {
        return { port, processes: [] };
      }
    })
  );
  
  // pythonプロセスのみを抽出
  for (const result of portChecks) {
    if (result.status !== 'fulfilled') continue;
    
    const { port, processes } = result.value;
    const pythonProcesses = processes.filter(p => 
      p.name && p.name.toLowerCase().includes('python') && 
      p.cmd && (p.cmd.toLowerCase().includes('main.py') || p.cmd.toLowerCase().includes('uvicorn'))
    );
    
    if (pythonProcesses.length > 0) {
      console.log(`ポート ${port} で ${pythonProcesses.length} 個のPythonプロセスを検出しました`);
    }
    
    for (const proc of pythonProcesses) {
      try {
        console.log(`プロセス ${proc.pid} を終了します (${proc.name})...`);
        process.kill(proc.pid, 'SIGTERM');
        cleanedUpPids.push(proc.pid);
      } catch (e) {
        console.error(`プロセス ${proc.pid} の終了に失敗しました:`, e.message);
      }
    }
  }
  
  // 終了したプロセスの終了を確認
  if (cleanedUpPids.length > 0) {
    console.log(`${cleanedUpPids.length}個のPythonプロセスの終了を待機中...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 待機時間延長: 1000ms→2000ms
    
    // 二次確認: プロセスが本当に終了したか確認
    for (const pid of cleanedUpPids) {
      try {
        // プロセスが存在するか確認
        process.kill(pid, 0);
        // まだ存在する場合は強制終了
        console.log(`プロセス ${pid} がまだ終了していません。強制終了します...`);
        process.kill(pid, 'SIGKILL');
      } catch (e) {
        // エラーが発生した場合、プロセスは既に終了している
      }
    }
  } else {
    console.log('クリーンアップするプロセスは見つかりませんでした');
  }
}

// FastAPIバックエンドを起動する関数（最適化）
function startFastApi() {
  return new Promise(async (resolve, reject) => {
    // リセットオブジェクト状態
    startupDetectionState = {
      startupMessageDetected: false,
      runningMessageDetected: false,
      connectionVerified: false
    };

    // 既存のプロセスをクリーンアップ（必要な場合のみ）
    if (!await checkPreviousServer()) {
      await cleanupExistingProcesses();
    }
    
    // 並列ポート検出
    const potentialPorts = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
    const selectedPort = await detectPortsInParallel(potentialPorts);
    
    if (!selectedPort) {
      reject(new Error("利用可能なポートがありません"));
      return;
    }
    
    console.log(`バックエンドサーバー用にポート ${selectedPort} を選択しました`);
    
    // ポート情報を一時ファイルに保存
    const portFilePath = path.join(os.tmpdir(), 'project_dashboard_port.txt');
    try {
      fs.writeFileSync(portFilePath, selectedPort.toString());
    } catch (err) {
      console.warn('ポート情報ファイルの保存に失敗:', err.message);
    }

    // 開発環境とビルド後の環境で実行パスを変更
    const resourcesPath = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app.asar.unpacked');
    
    // プラットフォームに応じたPythonパスの設定
    let pythonPath;
    if (isDev) {
      // 複数の可能性のあるパスを試行
      const possiblePaths = [
        'python',
        'python3',
        path.join(process.cwd(), 'backend', 'venv', 'Scripts', 'python.exe'), // Windows向け
        path.join(process.cwd(), 'backend', 'venv', 'bin', 'python') // Unix向け
      ];
      
      // 存在するパスを検出（同期的に実行）
      for (const p of possiblePaths) {
        try {
          if (p === 'python' || p === 'python3') {
            // コマンドの存在を確認
            require('child_process').execSync(`${p} --version`, {stdio: 'ignore'});
            pythonPath = p;
            console.log(`Python実行パスを検出: ${pythonPath}`);
            break;
          } else {
            // ファイルの存在を確認
            if (fs.existsSync(p)) {
              pythonPath = p;
              console.log(`Python実行パスを検出: ${pythonPath}`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // デフォルトのフォールバック
      if (!pythonPath) {
        pythonPath = 'python';
        console.log(`Python実行パスが見つからないため、デフォルト "${pythonPath}" を使用します`);
      }
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

    // タイムアウト基準値
    const STARTUP_TIMEOUT = 30000;  // 延長: 20秒→30秒
    const EXTENDED_TIMEOUT = 60000; // 延長: 40秒→60秒
    
    // タイムアウト管理
    let timeoutExtended = false;
    
    const startupTimeout = setTimeout(() => {
      if ((startupDetectionState.startupMessageDetected || 
          startupDetectionState.runningMessageDetected) && 
          !timeoutExtended) {
        timeoutExtended = true;
        console.log('バックエンドサーバー起動中...タイムアウトを延長します');
        
        setTimeout(() => {
          handleTimeout("延長タイムアウト");
        }, EXTENDED_TIMEOUT - STARTUP_TIMEOUT);
        
      } else if (!timeoutExtended) {
        handleTimeout("通常タイムアウト");
      }
    }, STARTUP_TIMEOUT);
    
    // タイムアウト処理ハンドラー
    const handleTimeout = (type) => {
      if ((startupDetectionState.startupMessageDetected || 
          startupDetectionState.runningMessageDetected) && 
          !startupDetectionState.connectionVerified) {
        
        console.log(`${type}: サーバーの起動メッセージを検出しましたが、接続確認ができませんでした。処理を続行します。`);
        
        // サーバーは起動している可能性があるため、強制終了せずに続行
        global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
        saveServerInfo(selectedPort);
        resolve(selectedPort);
        return;
      }
      
      // 通常のタイムアウト処理
      if (fastApiProcess) {
        console.error(`${type}: バックエンドサーバーが起動しませんでした。プロセスを終了します。`);
        try {
          fastApiProcess.kill();
        } catch (e) {
          console.error('プロセス終了エラー:', e.message);
        }
      }
      reject(new Error(`バックエンドサーバーの起動がタイムアウトしました。(${type})`));
    };

    console.log(`バックエンドサーバーを起動します: ${pythonPath} ${scriptPath} ${selectedPort}`);

    // FastAPIプロセスを起動 - ポート番号を引数として渡す
    fastApiProcess = spawn(pythonPath, [scriptPath, selectedPort.toString()], {
      stdio: 'pipe',
      detached: false,
      cwd: backendDir,
      env: { 
        ...process.env, 
        PYTHONPATH: backendDir,
        USE_ELECTRON_DIALOG: "true",
        PYTHONIOENCODING: "utf-8",
        PYTHONLEGACYWINDOWSSTDIO: "1",
        ELECTRON_PORT: selectedPort.toString(),
        PYTHONOPTIMIZE: "1",
        FASTAPI_STARTUP_OPTIMIZE: "1", // 高速起動モードを有効化
        STREAMLINED_LOGGING: "1", // 最適化されたログ出力
        DEBUG: isDev ? "1" : "0" // 開発環境の場合はデバッグを有効化
      }
    });

    // バッファをUTF-8として処理
    fastApiProcess.stdout.setEncoding('utf-8');
    fastApiProcess.stderr.setEncoding('utf-8');

    // パフォーマンス最適化: 非同期での接続確認準備
    const earlyConnectionCheck = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 待機時間延長: 500ms→1000ms
      let counter = 0;
      
      const checkInterval = setInterval(async () => {
        if (counter++ > 30 || startupDetectionState.connectionVerified) { // 回数増加: 20→30
          clearInterval(checkInterval);
          return;
        }
        
        console.log(`バックエンドサーバー接続確認 (試行 ${counter}/30)...`);
        const isConnected = await verifyApiConnection(selectedPort, 3); // リトライ回数増加: 1→3
        if (isConnected && !startupDetectionState.connectionVerified) {
          clearInterval(checkInterval);
          clearTimeout(startupTimeout);
          startupDetectionState.connectionVerified = true;
          global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
          saveServerInfo(selectedPort);
          recordPerformanceStage('api_connection_confirmed');
          console.log(`バックエンドサーバーへの接続が確認されました (ポート: ${selectedPort})`);
          resolve(selectedPort);
        }
      }, 500); // 間隔延長: 300ms→500ms
    };
    
    // 非同期で早期接続確認を開始
    earlyConnectionCheck();

    // プロセスのログを効率的に処理
    fastApiProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`バックエンドログ: ${output.trim()}`);
      
      // 起動成功メッセージの検出
      if (output.includes('Application startup complete')) {
        startupDetectionState.startupMessageDetected = true;
        recordPerformanceStage('api_startup_message');
        console.log('バックエンドサーバー起動メッセージを検出しました: Application startup complete');
      }
      
      if (output.includes('Uvicorn running')) {
        startupDetectionState.runningMessageDetected = true;
        recordPerformanceStage('uvicorn_running_message');
        console.log('バックエンドサーバー実行メッセージを検出しました: Uvicorn running');
      }
      
      // いずれかのメッセージが検出され、まだ接続確認が行われていない場合
      if ((startupDetectionState.startupMessageDetected || 
           startupDetectionState.runningMessageDetected) && 
          !startupDetectionState.connectionVerified) {
        
        // 重複実行を防止
        startupDetectionState.connectionVerified = true;
        
        // サーバー起動後、接続確認
        setTimeout(async () => {
          console.log('バックエンドサーバー起動メッセージを検出しました。接続確認を開始します...');
          
          let isConnected = false;
          // より多くの試行回数
          for (let attempt = 0; attempt < 10; attempt++) {
            console.log(`バックエンドサーバー接続確認 (試行 ${attempt + 1}/10)...`);
            isConnected = await verifyApiConnection(selectedPort, 4);
            
            if (isConnected) {
              clearTimeout(startupTimeout);
              global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
              saveServerInfo(selectedPort);
              recordPerformanceStage('api_connection_confirmed');
              console.log(`バックエンドサーバーへの接続が確認されました (ポート: ${selectedPort})`);
              resolve(selectedPort);
              break;
            }
            
            // 次の試行まで少し待機
            await new Promise(r => setTimeout(r, 1000));
          }
          
          if (!isConnected) {
            // 接続確認失敗後のフォールバック処理
            console.log('すべての接続試行が失敗しました。');
            
            if (startupDetectionState.startupMessageDetected || 
                startupDetectionState.runningMessageDetected) {
              // サーバーメッセージは検出されたが接続できない
              console.log('サーバーが起動している可能性があるため、処理を続行します。');
              global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
              saveServerInfo(selectedPort);
              resolve(selectedPort);
            } else {
              // 完全な失敗
              handleTimeout("接続確認失敗");
            }
          }
        }, 1000); // 待機時間延長: 500ms→1000ms
      }
    });

    fastApiProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`バックエンドエラー: ${output.trim()}`);
      
      // エラー出力にも起動成功メッセージがある場合があるので確認
      if (output.includes('Application startup complete')) {
        startupDetectionState.startupMessageDetected = true;
        recordPerformanceStage('api_startup_message_stderr');
        console.log('バックエンドサーバー起動メッセージをエラー出力で検出しました: Application startup complete');
      }
      
      if (output.includes('Uvicorn running')) {
        startupDetectionState.runningMessageDetected = true;
        recordPerformanceStage('uvicorn_running_message_stderr');
        console.log('バックエンドサーバー実行メッセージをエラー出力で検出しました: Uvicorn running');
      }
      
      // エラー内容のパターンに応じて処理
      if (output.includes('ModuleNotFoundError') || output.includes('No module named')) {
        console.error('Pythonモジュールが見つかりません。依存関係をインストールする必要があります。');
      } else if (output.includes('Permission') || output.includes('not permitted')) {
        console.error('権限エラーが発生しました。管理者権限で実行する必要があるかもしれません。');
      }
    });

    // エラーハンドリング
    fastApiProcess.on('error', (err) => {
      clearTimeout(startupTimeout);
      console.error('バックエンドプロセス起動エラー:', err.message);
      reject(new Error(`バックエンドサーバーの起動に失敗しました: ${err.message}`));
    });

    // プロセス終了時のハンドリング
    fastApiProcess.on('close', (code) => {
      // 成功フラグが立っていれば、プロセス終了は無視
      if (startupDetectionState.connectionVerified) return;
      
      // サーバーが正常に起動した後に終了した場合
      if (startupDetectionState.startupMessageDetected || 
          startupDetectionState.runningMessageDetected) {
        console.warn(`バックエンドサーバープロセスが予期せず終了しました。終了コード: ${code}`);
        // この段階でresolveかrejectが既に呼ばれているはず
      } else {
        // サーバーが起動前に終了した場合
        clearTimeout(startupTimeout);
        console.error(`バックエンドサーバーの起動に失敗しました。終了コード: ${code}`);
        reject(new Error(`FastAPIサーバーの起動に失敗しました。終了コード: ${code}`));
      }
      
      fastApiProcess = null;
    });
  });
}

// スプラッシュウィンドウを作成する関数 - 最適化
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });
  
  // スプラッシュHTMLをロード
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  
  // アプリ準備完了時にメインウィンドウを表示
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
    recordPerformanceStage('splash_shown');
  });
}

// メインウィンドウを作成する関数 - 最適化
function createWindow() {
  // CSP設定をセットアップ
  setupContentSecurityPolicy();
  
  recordPerformanceStage('create_main_window_start');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // 準備完了まで表示しない
    backgroundColor: '#1a1a1a', // ダークテーマの背景色をプリロード
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      v8CacheOptions: 'code',
      backgroundThrottling: false,
      // 修正：追加
      sandbox: false  // sandboxを無効にしてpreloadスクリプトの機能を確保
    }
  });

  // Next.jsアプリケーションのロード
  const url = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../out/index.html')}`;

  mainWindow.loadURL(url);
  
  // メインウィンドウの準備完了時の処理
  mainWindow.once('ready-to-show', () => {
    recordPerformanceStage('main_window_ready');
    
    if (splashWindow) {
      // スムーズな移行のためにタイマー使用
      setTimeout(() => {
        mainWindow.show();
        splashWindow.destroy();
        splashWindow = null;
        recordPerformanceStage('main_window_shown');
      }, 500);
    } else {
      mainWindow.show();
      recordPerformanceStage('main_window_shown_no_splash');
    }
  });
  
  // Electron APIが準備完了になったことをレンダラープロセスに通知
  mainWindow.webContents.on('did-finish-load', () => {
    recordPerformanceStage('renderer_loaded');
    
    // 修正: より確実にグローバル変数を設定
    mainWindow.webContents.executeJavaScript(`
      try {
        // グローバル変数の設定
        window.electronReady = true;
        window.electronInitTime = ${Date.now()};
        
        // メタタグを追加
        if (!document.querySelector('meta[name="electron-ready"]')) {
          const meta = document.createElement('meta');
          meta.name = 'electron-ready';
          meta.content = 'true';
          document.head.appendChild(meta);
        }
        
        // イベント発行
        document.dispatchEvent(new Event('electron-ready'));
        
        // パフォーマンスマーク
        if (window.performance && window.performance.mark) {
          window.performance.mark('renderer_ready');
        }
        
        console.log('Electron環境変数が正常に設定されました (main.js)');
      } catch (e) {
        console.error('Electron環境変数の設定中にエラーが発生しました:', e);
      }
    `).catch(err => {
      console.error('コード実行エラー:', err);
    });
  });

  // 開発ツールを開く（開発環境のみ）
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 10秒後にパフォーマンスメトリクスをロギング
  setTimeout(() => {
    try {
      mainWindow?.webContents.executeJavaScript(`
        const entries = performance.getEntriesByType('mark');
        const measurements = performance.getEntriesByType('measure');
        console.log('Renderer Performance Marks:', entries);
        console.log('Renderer Performance Measurements:', measurements);
      `);
      
      console.log('=== 最終パフォーマンスメトリクス ===');
      performanceMetrics.stages.forEach(stage => {
        console.log(`${stage.name}: ${stage.time}ms`);
      });
      console.log('総起動時間:', Date.now() - performanceMetrics.appStartTime, 'ms');
    } catch (e) {}
  }, 10000);
}

// CSP設定を構成 - セキュリティと高速化
function setupContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // 開発環境では'unsafe-eval'を許可、本番環境ではより制限的なCSPを使用
    const cspValue = isDev 
      ? "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
      : "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' http://127.0.0.1:*; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self';";
    
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspValue]
      }
    });
  });
}

// 起動シーケンス最適化 - 修正バージョン
const optimizedStartup = async () => {
  try {
    // プラットフォーム最適化を先行適用
    setupPlatformOptimizations();
    
    // パラレル初期化: スプラッシュ画面とバックエンド起動を並列実行
    createSplashWindow();
    
    // 前回の接続情報を先にチェック
    console.log('前回のバックエンドサーバー接続情報をチェックしています...');
    const previousServer = await checkPreviousServer();
    
    if (previousServer) {
      console.log(`前回のバックエンドサーバーを再利用します (ポート: ${previousServer})`);
      global.apiBaseUrl = `http://127.0.0.1:${previousServer}/api`;
      recordPerformanceStage('reused_previous_server');
      
      // メインウィンドウを先に表示（UXの向上）
      createWindow();
      
      // 接続確立をフロントエンドに通知 - 遅延実行
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('api-connection-established', {
            port: previousServer,
            apiUrl: global.apiBaseUrl
          });
        }
      }, 1000);
      
      return;
    }
    
    // メインウィンドウを先に作成開始
    createWindow();
    
    // バックエンドサーバー起動 - バックグラウンドで実行
    console.log('バックエンドサーバーを起動しています...');
    const port = await startFastApi();
    recordPerformanceStage('fastapi_started');
    console.log(`バックエンドサーバーが起動しました (ポート: ${port})`);
    
    // 接続確立をフロントエンドに通知 - 遅延実行
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.webContents.send('api-connection-established', {
          port: port,
          apiUrl: `http://127.0.0.1:${port}/api`
        });
      }
    }, 1000);
  } catch (error) {
    console.error('Application startup error:', error);
    
    // エラーがタイムアウトのみの場合、サーバーが実際には動いているかも
    if (error.message && (
        error.message.includes('タイムアウト') || 
        error.message.includes('接続を検証できませんでした'))) {
      
      // 改善: より役立つエラーメッセージと選択肢を提供
      const choice = await dialog.showMessageBox({
        type: 'warning',
        title: 'バックエンドサーバー接続警告',
        message: 'バックエンドサーバーが起動している可能性がありますが、接続を確認できませんでした。',
        detail: '続行するか、アプリケーションを終了するか選択してください。\n\n' +
                '続行を選択すると、接続が確立されるまで自動的に再試行します。\n\n' +
                '問題が発生した場合:\n' +
                '1. タスクマネージャーからPythonプロセスを終了してください\n' +
                '2. アプリケーションを再起動してください\n' +
                '3. 必要なPythonパッケージがインストールされていることを確認してください',
        buttons: ['続行する', 'アプリケーションを終了する'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (choice.response === 0) {
        // 続行を選択: メインウィンドウを作成して、バックグラウンドで接続を試行
        if (!mainWindow) {
          createWindow();
        }
        
        // バックグラウンドで接続を定期的に試行
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(async () => {
          retryCount++;
          console.log(`バックエンドサーバー接続再試行 (${retryCount}/${maxRetries})...`);
          
          try {
            // ポートの検出試行
            const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
            const results = await Promise.allSettled(
              ports.map(port => verifyApiConnection(port, 3))
            );
            
            const connectedIndex = results.findIndex(result => 
              result.status === 'fulfilled' && result.value === true
            );
            
            if (connectedIndex >= 0) {
              const connectedPort = ports[connectedIndex];
              global.apiBaseUrl = `http://127.0.0.1:${connectedPort}/api`;
              console.log(`バックエンドサーバーへの接続が確立されました (ポート: ${connectedPort})`);
              
              clearInterval(retryInterval);
              
              // メインウィンドウが存在する場合は通知
              if (mainWindow) {
                mainWindow.webContents.send('api-connection-established', {
                  port: connectedPort,
                  apiUrl: global.apiBaseUrl
                });
              }
              
              // サーバー情報を保存
              saveServerInfo(connectedPort);
            }
          } catch (err) {
            console.error('バックグラウンド接続エラー:', err);
          }
          
          // 最大試行回数に達したら終了
          if (retryCount >= maxRetries) {
            clearInterval(retryInterval);
            console.error('最大接続試行回数に達しました。再接続を停止します。');
          }
        }, 5000); // 5秒ごとに試行
        
        return;
      }
    }
    
    dialog.showErrorBox(
      'アプリケーション起動エラー',
      'バックエンドサーバーの起動に問題が発生しました。\n\n' +
      '考えられる原因:\n' +
      '1. 必要なPythonパッケージがインストールされていません\n' +
      '2. 必要なポートが使用中です\n' +
      '3. Pythonの環境設定に問題があります\n' +
      '4. ファイアウォールがポートをブロックしています\n\n' +
      '解決方法:\n' +
      '1. backend/requirements.txtのパッケージをインストールする\n' +
      '2. アプリケーションを再起動する\n' +
      '3. タスクマネージャーでPythonプロセスを終了する\n' +
      '4. ファイアウォール設定を確認する\n\n' +
      `エラー: ${error.message}\n`
    );
    
    app.quit();
  }
};

// アプリケーションの準備完了時に最適化された起動シーケンスを実行
app.whenReady().then(() => {
  recordPerformanceStage('app_ready');
  optimizedStartup().catch(err => {
    console.error('致命的な起動エラー:', err);
    app.quit();
  });
});

// アプリケーションが終了するとき
app.on('window-all-closed', async () => {
  appIsQuitting = true;
  
  if (fastApiProcess !== null) {
    try {
      console.log('FastAPIバックエンドの終了を試みています...');
      
      // まずAPIエンドポイントで正常終了を試みる
      try {
        const apiUrl = global.apiBaseUrl || 'http://localhost:8000/api';
        await axios.post(`${apiUrl}/shutdown`, {
          timeout: 2000
        });
        
        // 少し待機してプロセスが終了するのを待つ
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn('APIシャットダウンエンドポイントに接続できませんでした:', error.message);
      }
      
      // プロセスがまだ実行中の場合は強制終了
      if (fastApiProcess && !fastApiProcess.killed) {        
        // プロセス終了を試行
        try {
          console.log('SIGTERMシグナルでプロセスを終了しています...');
          fastApiProcess.kill('SIGTERM');
          
          // 1秒待ってまだ終了していなければSIGKILLで強制終了
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (fastApiProcess && !fastApiProcess.killed) {
            console.log('SIGKILLシグナルでプロセスを強制終了しています...');
            fastApiProcess.kill('SIGKILL');
          }
        } catch (e) {
          console.error('プロセス終了エラー:', e.message);
        }
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

// ファイル操作のIPC
ipcMain.handle('fs:exists', async (_, path) => {
  return fs.existsSync(path);
});

ipcMain.handle('fs:readFile', async (_, path, options) => {
  return fs.readFileSync(path, options);
});

ipcMain.handle('fs:writeFile', async (_, filePath, data, options) => {
  return fs.writeFileSync(filePath, data, options);
});

ipcMain.handle('fs:mkdir', async (_, dirPath, options) => {
  return fs.mkdirSync(dirPath, { recursive: true, ...options });
});

ipcMain.handle('fs:readdir', async (_, dirPath, options) => {
  return fs.readdirSync(dirPath, options);
});

// パス操作のIPC
ipcMain.handle('path:join', async (_, ...args) => {
  return path.join(...args);
});

ipcMain.handle('path:dirname', async (_, filePath) => {
  return path.dirname(filePath);
});

ipcMain.handle('path:basename', async (_, filePath) => {
  return path.basename(filePath);
});

// アプリケーション関連のIPC
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

// テスト用のダイアログハンドラー
ipcMain.handle('dialog:test', async () => {
  try {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'ダイアログテスト',
      message: 'これはElectronダイアログのテストです',
      buttons: ['OK']
    });
    return { success: true, result };
  } catch (error) {
    console.error('Test dialog error:', error);
    return { success: false, error: error.message };
  }
});