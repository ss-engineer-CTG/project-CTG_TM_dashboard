const { app, BrowserWindow, ipcMain, dialog, session, shell, protocol } = require('electron');
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

// 現在のAPIベースURL
global.apiBaseUrl = 'http://127.0.0.1:8000/api';

// サーバー起動検出の状態管理
let startupDetectionState = {
  startupMessageDetected: false,
  runningMessageDetected: false,
  connectionVerified: false
};

// 初期化フェーズを記録
console.log('Electron初期化開始');

// プラットフォーム固有の最適化を設定
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
}

// 既存のPythonプロセスをクリーンアップする関数
async function cleanupExistingProcesses() {
  // 対象となるポートのリスト
  const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
  let cleanedUpPids = [];
  
  console.log('既存のPythonプロセスをクリーンアップしています...');
  
  // ポート検索を実行
  for (const port of ports) {
    try {
      const processes = await findProcess('port', port);
      
      // pythonプロセスのみを抽出
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
    } catch (e) {
      console.error(`ポート ${port} のプロセス検索エラー:`, e.message);
    }
  }
  
  // 終了したプロセスの終了を確認
  if (cleanedUpPids.length > 0) {
    console.log(`${cleanedUpPids.length}個のPythonプロセスの終了を待機中...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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

// API利用可能性チェック関数
const verifyApiConnection = async (port, maxRetries = 5) => {
  // 詳細なチェック
  for (let i = 0; i < maxRetries; i++) {
    try {
      // axios経由でAPI確認
      const response = await axios.get(`http://127.0.0.1:${port}/api/health`, {
        timeout: 2000,
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
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // 最終確認：起動メッセージ検出
  if (startupDetectionState.startupMessageDetected || 
      startupDetectionState.runningMessageDetected) {
    return true;
  }
  
  return false;
};

// FastAPIバックエンドを起動する関数
async function startFastApi() {
  try {
    // リセットオブジェクト状態
    startupDetectionState = {
      startupMessageDetected: false,
      runningMessageDetected: false,
      connectionVerified: false
    };

    // 既存のプロセスをクリーンアップ
    await cleanupExistingProcesses();
    
    // デフォルトポート設定
    const selectedPort = 8000;
    
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
      
      // 存在するパスを検出
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
    const STARTUP_TIMEOUT = 30000;
    
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
        FASTAPI_STARTUP_OPTIMIZE: "1",
        STREAMLINED_LOGGING: "1",
        DEBUG: isDev ? "1" : "0"
      }
    });

    // バッファをUTF-8として処理
    fastApiProcess.stdout.setEncoding('utf-8');
    fastApiProcess.stderr.setEncoding('utf-8');

    // プロミスを返して接続が確立されるのを待つ
    return new Promise((resolve, reject) => {
      // タイムアウト設定
      const timeoutId = setTimeout(() => {
        reject(new Error('バックエンドサーバーの起動がタイムアウトしました'));
      }, STARTUP_TIMEOUT);
      
      // 標準出力を監視して起動シグナルを検出
      fastApiProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`バックエンドログ: ${output.trim()}`);
        
        if (output.includes('Application startup complete') || 
            output.includes('Uvicorn running')) {
          clearTimeout(timeoutId);
          startupDetectionState.startupMessageDetected = true;
          global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
          
          // 接続確認を行う
          setTimeout(async () => {
            const isConnected = await verifyApiConnection(selectedPort);
            if (isConnected) {
              startupDetectionState.connectionVerified = true;
              resolve(selectedPort);
            } else {
              resolve(selectedPort); // 接続確認は失敗したが、起動メッセージは確認できたので続行
            }
          }, 1000);
        }
      });
      
      // エラー出力の処理
      fastApiProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`バックエンドエラー: ${output.trim()}`);
        
        // エラー出力にも起動成功メッセージがある場合がある
        if (output.includes('Application startup complete') || 
            output.includes('Uvicorn running')) {
          clearTimeout(timeoutId);
          startupDetectionState.startupMessageDetected = true;
          global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
          resolve(selectedPort);
        }
      });
      
      // エラーハンドリング
      fastApiProcess.on('error', (err) => {
        clearTimeout(timeoutId);
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
          clearTimeout(timeoutId);
          reject(new Error(`FastAPIサーバーの起動に失敗しました。終了コード: ${code}`));
        }
        
        fastApiProcess = null;
      });
    });
  } catch (error) {
    console.error('バックエンド起動エラー:', error);
    throw error;
  }
}

// バックエンドサーバーを再起動する関数
async function restartBackendServer() {
  // 既存のプロセスがあれば終了
  if (fastApiProcess !== null) {
    try {
      console.log('既存のバックエンドサーバーを終了します...');
      fastApiProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 終了を待機
    } catch (e) {
      console.error('プロセス終了エラー:', e.message);
    }
    fastApiProcess = null;
  }
  
  // バックエンドサーバーを再起動
  try {
    const port = await startFastApi();
    console.log(`バックエンドサーバーが再起動されました (ポート: ${port})`);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api-connection-established', {
        port: port,
        apiUrl: `http://127.0.0.1:${port}/api`
      });
    }
    
    return port;
  } catch (error) {
    console.error('バックエンドサーバー再起動エラー:', error);
    throw error;
  }
}

// スプラッシュウィンドウを作成する関数
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
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  // スプラッシュHTMLをロード
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  
  // アプリ準備完了時にメインウィンドウを表示
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

// ビルド進捗を更新
function updateBuildProgress(message, progress) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('build-progress', { message, progress });
  }
}

// 起動進捗を更新
function updateStartupProgress(message, progress) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('startup-progress', { message, progress });
  }
}

// CSP設定を構成
function setupContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // 開発環境と本番環境で異なるCSP設定
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

// メインウィンドウを作成する関数
function createWindow() {
  // CSP設定をセットアップ
  setupContentSecurityPolicy();
  
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
      sandbox: false  // sandboxを無効にしてpreloadスクリプトの機能を確保
    }
  });

  // 静的ファイルの存在確認
  const staticPath = path.join(__dirname, '../frontend/out/index.html');
  try {
    if (!fs.existsSync(staticPath)) {
      console.error(`エラー: 静的ファイルが見つかりません: ${staticPath}`);
      console.error('npm run build コマンドを実行して静的ファイルを生成してください');
      updateStartupProgress('静的ファイルが見つかりません。アプリを終了します...', 100);
      
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          dialog.showMessageBoxSync(splashWindow, {
            type: 'error',
            title: '起動エラー',
            message: '静的ファイルが見つかりません',
            detail: '開発モードでもビルド済みの静的ファイルが必要です。\n\nnpm run build コマンドを実行してください。',
            buttons: ['OK']
          });
          app.quit();
        }
      }, 1000);
      return;
    }
  } catch (err) {
    console.error('ファイル確認エラー:', err);
  }

  // 静的ファイルをロード（開発モード・本番モード共通）
  const url = `file://${path.join(__dirname, '../frontend/out/index.html')}`;
  mainWindow.loadURL(url);
  
  // メインウィンドウの準備完了時の処理
  mainWindow.once('ready-to-show', () => {
    updateStartupProgress('アプリケーションを準備中...', 90);
    
    if (splashWindow) {
      // スムーズな移行のためにタイマー使用
      setTimeout(() => {
        mainWindow.show();
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.destroy();
        }
      }, 500);
    } else {
      mainWindow.show();
    }
  });
  
  // Electron APIが準備完了になったことをレンダラープロセスに通知
  mainWindow.webContents.on('did-finish-load', () => {
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

  // ファイル変更を監視して自動リロード（開発モードのみ）
  if (isDev) {
    try {
      const chokidar = require('chokidar');
      const watcher = chokidar.watch(path.join(__dirname, '../out'), {
        ignored: /(^|[\/\\])\../, // ドットファイルを無視
        persistent: true
      });
      
      watcher.on('change', (changedPath) => {
        console.log(`ファイルが変更されました: ${changedPath}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('ウィンドウを再読み込みします...');
          mainWindow.webContents.reloadIgnoringCache();
        }
      });
      
      // アプリ終了時にウォッチャーを閉じる
      app.on('before-quit', () => {
        watcher.close();
      });
    } catch (err) {
      console.error('ファイル監視エラー:', err);
    }
  }

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 起動シーケンス最適化
const optimizedStartup = async () => {
  try {
    // プラットフォーム最適化を先行適用
    setupPlatformOptimizations();
    
    // パラレル初期化: スプラッシュ画面とバックエンド起動を並列実行
    createSplashWindow();
    updateStartupProgress('アプリケーションを初期化中...', 10);
    
    // メインウィンドウを先に作成開始
    updateStartupProgress('ウィンドウを準備中...', 30);
    createWindow();
    
    // バックエンドサーバー起動 - バックグラウンドで実行
    updateStartupProgress('バックエンドサーバーを起動中...', 50);
    console.log('バックエンドサーバーを起動しています...');
    const port = await startFastApi();
    console.log(`バックエンドサーバーが起動しました (ポート: ${port})`);
    
    updateStartupProgress('接続を確立中...', 70);
    
    // 接続確立をフロントエンドに通知 - 遅延実行
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.webContents.send('api-connection-established', {
          port: port,
          apiUrl: `http://127.0.0.1:${port}/api`
        });
      }
    }, 1000);
    
    updateStartupProgress('アプリケーションを起動中...', 90);
    
  } catch (error) {
    console.error('Application startup error:', error);
    
    if (splashWindow && !splashWindow.isDestroyed()) {
      updateStartupProgress('エラーが発生しました...', 100);
      
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
    }
    
    app.quit();
  }
};

// APIリクエストハンドラ
ipcMain.handle('api:request', async (event, method, path, params, data, options) => {
  let retries = options?.retries || 0;
  const maxRetries = 3;
  
  while (retries <= maxRetries) {
    try {
      // APIベースURLの取得
      const baseUrl = global.apiBaseUrl;
      const url = new URL(path.startsWith('/') ? path.substring(1) : path, baseUrl);
      
      // パラメータの追加
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
          }
        });
      }
      
      // FastAPIバックエンドへリクエスト送信
      const response = await axios({
        method: method,
        url: url.toString(),
        data: data,
        timeout: options?.timeout || 10000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options?.headers || {})
        }
      });
      
      return response.data;
    } catch (error) {
      retries++;
      
      // 最終試行でもエラーの場合は通常通り例外をスロー
      if (retries > maxRetries) {
        // エラー情報を整形して返す
        const formattedError = {
          message: error.message || 'API通信エラー',
          status: error.response?.status || 0,
          details: error.response?.data || error.toString(),
          type: error.code === 'ECONNABORTED' ? 'timeout_error' : 
                error.code === 'ECONNREFUSED' ? 'network_error' : 'server_error'
        };
        
        throw formattedError;
      }
      
      // 接続エラーの場合はバックエンドの再起動を試みる
      if (error.code === 'ECONNREFUSED' && retries === 1) {
        console.log('バックエンド接続エラー、サーバーの再起動を試みます...');
        try {
          await restartBackendServer();
          // 再起動後に少し待機
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (restartError) {
          console.error('バックエンド再起動エラー:', restartError);
        }
      } else {
        // 他のエラーの場合は少し待ってから再試行
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
});

// アプリケーションの準備完了時に最適化された起動シーケンスを実行
app.whenReady().then(() => {
  // protocol handlerを追加 - パス解決を改善
  protocol.registerFileProtocol('file', (request, callback) => {
    let url = request.url.substr(7); // 'file://'を除去
    
    // URLデコード（スペースや特殊文字の処理）
    url = decodeURIComponent(url);
    
    // パス正規化とセキュリティチェック
    const normalizedPath = path.normalize(url);
    
    // アプリケーションのルートパスを基準にする
    const rootPath = path.join(__dirname, '..');
    
    // 相対パスの解決
    let filePath;
    if (normalizedPath.startsWith('/')) {
      // ルートからの相対パスの場合
      filePath = path.join(rootPath, 'out', normalizedPath);
    } else {
      // その他の場合は通常の結合
      filePath = path.join(rootPath, normalizedPath);
    }
    
    callback({ path: filePath });
  });
  
  optimizedStartup().catch(err => {
    console.error('致命的な起動エラー:', err);
    app.quit();
  });
});

// F12キーでデバッグツールを開く
ipcMain.on('toggle-devtools', () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools();
    }
  }
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

// ファイル/フォルダを開くためのIPC
ipcMain.handle('fs:openPath', async (_, pathToOpen) => {
  try {
    // パスが存在するか確認
    if (!fs.existsSync(pathToOpen)) {
      return {
        success: false,
        message: `パスが見つかりません: ${pathToOpen}`,
        error: 'NOT_FOUND'
      };
    }
    
    // shell.openPathを使用してファイル/フォルダを開く
    const result = await shell.openPath(pathToOpen);
    
    // エラーがあるかチェック (空の文字列はエラーなし)
    if (result === '') {
      return {
        success: true,
        message: `パスを正常に開きました: ${pathToOpen}`,
        path: pathToOpen
      };
    } else {
      // エラーメッセージがある場合
      return {
        success: false,
        message: `パスを開けませんでした: ${result}`,
        error: 'OPEN_ERROR',
        path: pathToOpen
      };
    }
  } catch (error) {
    console.error('ファイル/フォルダを開く際のエラー:', error);
    return {
      success: false,
      message: `エラーが発生しました: ${error.message}`,
      error: 'EXCEPTION',
      path: pathToOpen
    };
  }
});

// パス正規化と検証のためのIPC
ipcMain.handle('fs:validatePath', async (_, inputPath) => {
  try {
    // パスの正規化
    const normalizedPath = path.normalize(inputPath);
    
    // 存在確認
    const exists = fs.existsSync(normalizedPath);
    
    // ファイルタイプの確認 (ファイルかディレクトリか)
    let type = 'unknown';
    if (exists) {
      const stats = fs.statSync(normalizedPath);
      type = stats.isDirectory() ? 'directory' : 'file';
    }
    
    return {
      success: true,
      normalizedPath,
      exists,
      type
    };
  } catch (error) {
    return {
      success: false,
      message: `パスの検証に失敗しました: ${error.message}`,
      error: 'VALIDATION_ERROR',
      inputPath
    };
  }
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

// APIベースURLを取得するハンドラ
ipcMain.handle('get-api-base-url', () => {
  return global.apiBaseUrl;
});

// 一時ディレクトリのパスを取得するハンドラ
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