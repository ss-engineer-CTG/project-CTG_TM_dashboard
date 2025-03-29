const { app, BrowserWindow, ipcMain, dialog, session, shell, protocol, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const waitOn = require('wait-on');
const findProcess = require('find-process');
const fs = require('fs');
const axios = require('axios');
const os = require('os');
const http = require('http');

// 設定ベースのアプローチ - 環境による分岐を最小化
const config = {
  // 環境変数またはコマンドライン引数から設定を読み込む
  // デフォルト値は共通の挙動を示す
  debug: process.env.DEBUG === 'true' || isDev,
  openDevTools: process.env.OPEN_DEVTOOLS === 'true' || isDev,
  apiPort: process.env.API_PORT || '8000',
  watchFiles: !app.isPackaged && (process.env.WATCH_FILES !== 'false'), // 本番環境では無効化
  optimizationEnabled: process.env.OPTIMIZATION === 'true' || false,
  useExternalBackend: process.env.EXTERNAL_BACKEND === 'true' || process.env.USE_EXTERNAL_BACKEND === 'true'
};

// 安全なパス解決関数
const getResourcePath = (relativePath) => {
  try {
    // app初期化状態をチェック
    const isPackaged = app && typeof app.isPackaged === 'boolean' ? app.isPackaged : false;
    
    let rootPath;
    if (isPackaged) {
      // パッケージ化された環境では、リソースパスを app.asar.unpacked に明示的に指定
      rootPath = path.join(process.resourcesPath, 'app.asar.unpacked');
      console.log(`パッケージ環境でのリソースパス基点: ${rootPath}`);
    } else {
      // 開発環境
      rootPath = path.join(__dirname, '..');
      console.log(`開発環境でのリソースパス基点: ${rootPath}`);
    }
    
    const resolvedPath = path.join(rootPath, relativePath);
    
    // 開発モードでのみログを出力
    if (isDev || process.env.DEBUG === 'true') {
      console.log(`リソースパス解決: ${relativePath} -> ${resolvedPath}`);
      
      // パスが存在するか確認（デバッグ用）
      if (fs.existsSync(resolvedPath)) {
        console.log(`パスが存在します: ${resolvedPath}`);
      } else {
        console.warn(`パスが存在しません: ${resolvedPath}`);
      }
    }
    
    return resolvedPath;
  } catch (e) {
    // エラー時はフォールバックパスを使用
    console.warn('パス解決エラー:', e);
    return path.join(__dirname, '..', relativePath);
  }
};

// FastAPIバックエンドのプロセス
let fastApiProcess = null;
let mainWindow = null;
let splashWindow = null;
let appIsQuitting = false;

// 現在のAPIベースURL
global.apiBaseUrl = `http://127.0.0.1:${config.apiPort}/api`;

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
    app.dock?.setIcon(getResourcePath('src/public/favicon.ico'));
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
    // 外部バックエンドの使用確認
    const useExternalBackend = process.env.EXTERNAL_BACKEND === 'true' || 
                              process.env.USE_EXTERNAL_BACKEND === 'true' ||
                              config.useExternalBackend;
    
    // リセットオブジェクト状態
    startupDetectionState = {
      startupMessageDetected: false,
      runningMessageDetected: false,
      connectionVerified: false
    };

    // ポート情報を一時ファイルから読み込み
    let selectedPort = parseInt(config.apiPort);
    let portFilePath = path.join(os.tmpdir(), 'project_dashboard_port.txt');
    
    try {
      if (fs.existsSync(portFilePath)) {
        const portFromFile = fs.readFileSync(portFilePath, 'utf-8').trim();
        if (portFromFile && !isNaN(parseInt(portFromFile))) {
          selectedPort = parseInt(portFromFile);
          console.log(`一時ファイルからポート ${selectedPort} を取得しました`);
        }
      }
    } catch (err) {
      console.warn('ポート情報ファイルの読み込みに失敗:', err.message);
    }
    
    console.log(`バックエンドサーバー用にポート ${selectedPort} を選択しました`);
    
    // 外部バックエンドを使用する場合は、既存の接続をチェック
    if (useExternalBackend) {
      console.log('外部バックエンドモードを使用: バックエンドの起動をスキップします');
      
      // 接続確認
      const isConnected = await verifyApiConnection(selectedPort, 3);
      if (isConnected) {
        console.log(`既存のバックエンドサーバーに接続成功（ポート: ${selectedPort}）`);
        global.apiBaseUrl = `http://127.0.0.1:${selectedPort}/api`;
        startupDetectionState.connectionVerified = true;
        return selectedPort;
      } else {
        console.warn(`外部バックエンドへの接続に失敗しました（ポート: ${selectedPort}）`);
        console.warn('内部バックエンド起動に切り替えます');
      }
    }

    // 既存のプロセスをクリーンアップ
    await cleanupExistingProcesses();
    
    // デフォルトポート設定
    selectedPort = parseInt(config.apiPort);
    
    console.log(`バックエンドサーバー用にポート ${selectedPort} を選択しました`);
    
    // ポート情報を一時ファイルに保存 - 変数の再宣言をなくし、上で宣言した変数を再利用
    try {
      fs.writeFileSync(portFilePath, selectedPort.toString());
    } catch (err) {
      console.warn('ポート情報ファイルの保存に失敗:', err.message);
    }

    // 一貫したパス解決を使用
    const backendDir = getResourcePath('backend');
    const scriptPath = path.join(backendDir, 'app', 'main.py');

    // プラットフォームに応じたPythonパスの設定
    let pythonPath;
    
    // 環境に応じて明確に分岐
    if (app.isPackaged) {
      // 本番環境では明示的なパスを使用
      if (process.platform === 'win32') {
        pythonPath = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
      } else {
        pythonPath = path.join(backendDir, 'venv', 'bin', 'python');
      }
      console.log(`本番環境のPython実行パス: ${pythonPath}`);
    } else {
      // 開発環境ではパスを検出
      const possiblePaths = [
        'python',
        'python3',
        path.join(backendDir, 'venv', 'Scripts', 'python.exe'),
        path.join(backendDir, 'venv', 'bin', 'python')
      ];
      
      // 存在するパスを検出
      for (const p of possiblePaths) {
        try {
          if (p === 'python' || p === 'python3') {
            // コマンドの存在を確認
            require('child_process').execSync(`${p} --version`, {stdio: 'ignore'});
            pythonPath = p;
            console.log(`開発環境のPython実行パス: ${pythonPath}`);
            break;
          } else {
            // ファイルの存在を確認
            if (fs.existsSync(p)) {
              pythonPath = p;
              console.log(`開発環境のPython実行パス: ${pythonPath}`);
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
    }

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
        DEBUG: config.debug ? "1" : "0"
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
    // 開発環境と本番環境で同じCSP設定
    const cspValue = "default-src 'self'; " +
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

// 安全なファイルプロトコル設定
function setupSecureFileProtocol() {
  // ファイルプロトコルハンドラーを登録 - 開発/本番共通
  protocol.registerFileProtocol('file', (request, callback) => {
    // URLデコードとセキュリティチェック
    const url = decodeURIComponent(request.url.substr(7)); // 'file://'を除去
    const normalizedPath = path.normalize(url);
    
    // プロジェクトルート基準の相対パス解決
    const rootPath = getResourcePath('.');
    let resolvedPath;
    
    if (normalizedPath.startsWith(rootPath)) {
      // プロジェクト内パスの場合は直接使用
      resolvedPath = normalizedPath;
    } else {
      // 相対パスの場合はビルドディレクトリからの解決
      resolvedPath = path.join(rootPath, 'build', normalizedPath);
    }
    
    callback({ path: resolvedPath });
  });
}

// 開発と本番環境で異なるファイル監視の設定
function setupDevelopmentEnvironment() {
  // 本番環境では何もしない
  if (app.isPackaged || !config.watchFiles) {
    console.log('本番環境またはファイル監視無効モードのため、ファイル監視はスキップします');
    return;
  }

  // 開発環境のみで必要なモジュールを動的にロード
  let chokidar;
  try {
    chokidar = require('chokidar');
  } catch (err) {
    console.warn('chokidarモジュールを読み込めませんでした。ファイル監視は無効化されます:', err.message);
    return;
  }

  console.log('ファイル監視を設定中...');
  
  // 開発環境のみでファイル監視を設定
  const watcher = chokidar.watch(getResourcePath('build'), {
    ignored: /(^|[\/\\])\../,
    persistent: true
  });
  
  // ファイル変更を検知したらメインウィンドウを再読み込み
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
}

// グローバルショートカットを登録
function registerGlobalShortcuts() {
  globalShortcut.register('CommandOrControl+R', () => {
    // データ更新ショートカット
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shortcut-refresh-data');
    }
  });
  
  globalShortcut.register('CommandOrControl+O', () => {
    // ファイル選択ショートカット
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shortcut-select-file');
    }
  });
  
  // デバッグツールショートカット - 設定に基づいて制御
  if (config.debug) {
    globalShortcut.register('F12', () => {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools();
        }
      }
    });
  }
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
  const staticPath = getResourcePath('build/index.html');
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
            detail: '静的ファイルが必要です。\n\nnpm run build コマンドを実行してください。',
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

  // 静的ファイルをロード（開発/本番で同じパス）
  const url = `file://${staticPath}`;
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
    // より確実にグローバル変数を設定
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

  // 開発ツールを設定ベースで開く
  if (config.openDevTools) {
    mainWindow.webContents.openDevTools();
  }

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 共通の環境変数設定
const setupEnvironmentVariables = () => {
  // パス情報 - 開発/本番で同じ基準
  process.env.APP_ROOT = getResourcePath('.');
  process.env.BUILD_PATH = getResourcePath('build');
  process.env.DATA_PATH = getResourcePath('data');
  
  // APIポート - 常に同じポートを使用
  process.env.API_PORT = config.apiPort;
  
  // コンソールに明示的に出力
  console.log('環境変数設定:');
  console.log(`- APP_ROOT: ${process.env.APP_ROOT}`);
  console.log(`- BUILD_PATH: ${process.env.BUILD_PATH}`);
  console.log(`- API_PORT: ${process.env.API_PORT}`);
};

// 起動シーケンス最適化
const optimizedStartup = async () => {
  try {
    // 1. 環境変数設定
    setupEnvironmentVariables();
    
    // 2. プラットフォーム最適化を先行適用
    setupPlatformOptimizations();
    
    // 3. スプラッシュ画面表示
    createSplashWindow();
    updateStartupProgress('アプリケーションを初期化中...', 10);
    
    // 4. ファイルプロトコル設定
    setupSecureFileProtocol();
    
    // 5. 事前チェック: 静的ファイルが存在するか確認
    const staticPath = getResourcePath('build/index.html');
    if (!fs.existsSync(staticPath)) {
      throw new Error(`静的ファイルが見つかりません: ${staticPath}`);
    }
    
    // 6. 並列処理: バックエンド起動とメインウィンドウ初期化を並行
    updateStartupProgress('バックエンドサーバーを起動中...', 30);
    console.log('バックエンドサーバーを起動しています...');
    const startupPromises = [
      startFastApi().catch(error => {
        console.error('バックエンド起動エラー:', error);
        throw error;
      }),
      
      new Promise(resolve => {
        updateStartupProgress('ウィンドウを準備中...', 50);
        createWindow();
        resolve();
      })
    ];
    
    // 7. 並列処理の完了を待機
    const [port] = await Promise.all(startupPromises);
    console.log(`バックエンドサーバーが起動しました (ポート: ${port})`);
    
    // 8. 開発環境セットアップ（本番環境では無効）
    setupDevelopmentEnvironment();
    
    // 9. グローバルショートカット登録
    registerGlobalShortcuts();
    
    // 10. 接続確立
    updateStartupProgress('接続を確立中...', 70);
    if (mainWindow) {
      // APIポート情報を環境変数から一貫して取得
      mainWindow.webContents.send('api-connection-established', {
        port: port,
        apiUrl: `http://127.0.0.1:${port}/api`
      });
    }
    
    // 11. 起動完了
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
      
      // パスの修正 - /apiが既に含まれているか確認
      let apiPath = path;
      if (!path.startsWith('/api/')) {
        // /で始まる場合は/apiを前置
        if (path.startsWith('/')) {
          apiPath = `/api${path}`;
        } else {
          // それ以外は/api/を前置
          apiPath = `/api/${path}`;
        }
      }
      
      const url = new URL(apiPath.startsWith('/') ? apiPath.substring(1) : apiPath, baseUrl);
      
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

// ショートカットメッセージの処理
ipcMain.on('shortcut-refresh-data', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shortcut-refresh-data');
  }
});

ipcMain.on('shortcut-select-file', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shortcut-select-file');
  }
});

// アプリケーションの準備完了時に最適化された起動シーケンスを実行
app.whenReady().then(() => {
  optimizedStartup().catch(err => {
    console.error('致命的な起動エラー:', err);
    app.quit();
  });
});

// F12キーでデバッグツールを開く - 設定ベース
ipcMain.on('toggle-devtools', () => {
  if (mainWindow && config.debug) {
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
        const apiUrl = global.apiBaseUrl || `http://localhost:${config.apiPort}/api`;
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

  // グローバルショートカットの解除
  globalShortcut.unregisterAll();

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