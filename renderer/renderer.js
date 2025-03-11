// DOM要素の参照
const dashboardView = document.getElementById('dashboard-view');
const selectFileButton = document.getElementById('select-file-button');
const refreshDataButton = document.getElementById('refresh-data-button');
const selectedFileDisplay = document.getElementById('selected-file-display');
const updateTimeElement = document.getElementById('update-time');
const loadingOverlay = document.getElementById('loading-overlay');
const serverErrorOverlay = document.getElementById('server-error-overlay');
const serverErrorDetails = document.getElementById('server-error-details');
const retryConnectionButton = document.getElementById('retry-connection-button');
const serverStatus = document.getElementById('server-status');
const serverStatusDot = serverStatus.querySelector('.status-dot');
const serverStatusText = serverStatus.querySelector('.status-text');
const appVersionElement = document.getElementById('app-version');
const notificationContainer = document.getElementById('notification-container');
const notificationMessage = document.getElementById('notification-message');
const closeNotificationButton = document.getElementById('close-notification');

// 現在選択されているファイルパスを保持する変数
let currentFilePath = null;
// サーバー接続状態
let serverConnected = false;
// WebViewロード完了フラグ
let webviewLoaded = false;
// リトライタイマーID
let retryTimerId = null;
// 最大リトライ回数
const MAX_RETRIES = 5;
// 現在のリトライ回数
let currentRetries = 0;

// アプリケーションの初期化
function initApp() {
  // バージョン情報の表示
  appVersionElement.textContent = `Version: ${window.electronAPI.getAppVersion()}`;
  
  // Pythonサーバーのステータス監視を開始
  const unsubscribe = window.electronAPI.onPythonServerStatusChange(handleServerStatusChange);
  
  // イベントリスナーの設定
  selectFileButton.addEventListener('click', handleFileSelection);
  refreshDataButton.addEventListener('click', handleDataRefresh);
  retryConnectionButton.addEventListener('click', handleRetryConnection);
  closeNotificationButton.addEventListener('click', hideNotification);
  
  // WebViewのイベントリスナー
  dashboardView.addEventListener('did-start-loading', () => {
    console.log('WebView started loading');
    showLoading();
    webviewLoaded = false;
  });
  
  dashboardView.addEventListener('did-stop-loading', () => {
    console.log('WebView stopped loading');
    setTimeout(() => {
      if (webviewLoaded) {
        hideLoading();
      }
    }, 1000); // ロード完了後も少し待機
    
    checkServerConnection();
  });
  
  // 新規: WebViewのDOM準備完了イベント
  dashboardView.addEventListener('dom-ready', () => {
    console.log('WebView DOM ready');
    
    // 開発モードの場合はWebViewのデベロッパーツールを開く
    if (process.env.NODE_ENV === 'development' || location.search.includes('dev')) {
      console.log('Opening WebView DevTools');
      dashboardView.openDevTools();
    }
  });
  
  // 新規: WebViewからのメッセージを受信
  window.addEventListener('message', (event) => {
    console.log('Received message from WebView:', event.data);
    
    if (event.data.type === 'dash-loaded') {
      console.log('Dash application loaded in WebView');
      webviewLoaded = true;
      hideLoading();
    } else if (event.data.type === 'notification') {
      showNotification(event.data.message);
    } else if (event.data.type === 'error') {
      showNotification(`WebView error: ${event.data.message}`, true);
    }
  });
  
  dashboardView.addEventListener('did-fail-load', (event) => {
    console.error('WebView failed to load:', event);
    handleConnectionError(`ダッシュボードの読み込みに失敗しました (${event.errorCode})`);
    
    // 読み込み失敗時の自動リトライ
    if (currentRetries < MAX_RETRIES) {
      currentRetries++;
      console.log(`自動リトライ (${currentRetries}/${MAX_RETRIES})...`);
      retryTimerId = setTimeout(() => {
        dashboardView.reload();
      }, 3000); // 3秒後にリトライ
    } else {
      console.error('最大リトライ回数に達しました');
    }
  });
  
  // ページアンロード時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    unsubscribe();
    if (retryTimerId) {
      clearTimeout(retryTimerId);
    }
  });
  
  // 初期接続チェック
  setTimeout(checkServerConnection, 2000);
}

// サーバー接続状態の変更ハンドラー
function handleServerStatusChange(status) {
  console.log('Server status changed:', status);
  
  if (status.status === 'running') {
    serverConnected = true;
    updateServerStatusUI(true);
    hideServerErrorOverlay();
    
    // サーバーが起動したらWebViewをリロード
    if (!webviewLoaded) {
      // リトライカウンターをリセット
      currentRetries = 0;
      console.log('Reloading WebView after server started');
      dashboardView.reload();
    }
  } else {
    serverConnected = false;
    updateServerStatusUI(false);
    handleConnectionError(`サーバーが停止しました (コード: ${status.code || 'unknown'})`);
  }
}

// サーバー接続状態UIの更新
function updateServerStatusUI(connected) {
  serverStatusDot.className = 'status-dot ' + (connected ? 'connected' : 'error');
  serverStatusText.textContent = `サーバー状態: ${connected ? '接続済み' : '切断'}`;
}

// ファイル選択ハンドラー
async function handleFileSelection() {
  try {
    const filePath = await window.electronAPI.selectFile();
    if (filePath) {
      currentFilePath = filePath;
      selectedFileDisplay.textContent = `現在のファイル: ${filePath}`;
      
      showLoading();
      
      // 選択されたファイルパスをバックエンドに送信
      await window.electronAPI.callBackend('update-file-path', 'POST', { file_path: filePath });
      
      // データの更新
      await handleDataRefresh();
      
      showNotification(`ファイルを選択しました: ${filePath}`);
    }
  } catch (error) {
    console.error('File selection error:', error);
    showNotification(`ファイル選択エラー: ${error.message}`, true);
    hideLoading();
  }
}

// データ更新ハンドラー
async function handleDataRefresh() {
  if (!serverConnected) {
    showNotification('サーバーに接続されていません', true);
    return;
  }
  
  try {
    showLoading();
    
    // バックエンドにデータ更新リクエストを送信
    const response = await window.electronAPI.callBackend('refresh-dashboard', 'POST');
    console.log('データ更新レスポンス:', response);
    
    // WebViewをリロード
    webviewLoaded = false;
    dashboardView.reload();
    
    // 更新時間の更新
    updateTimeElement.textContent = `最終更新: ${new Date().toLocaleString()}`;
    
    showNotification('データを更新しました');
  } catch (error) {
    console.error('Data refresh error:', error);
    hideLoading();
    showNotification('データ更新エラー: ' + error.message, true);
  }
}

// 再接続ハンドラー
function handleRetryConnection() {
  // リトライカウンターをリセット
  currentRetries = 0;
  
  showLoading();
  console.log('手動でサーバー接続を再試行します...');
  
  // サーバー接続状態をチェック
  checkServerConnection()
    .then(connected => {
      if (connected) {
        console.log('サーバー接続成功、WebViewをリロードします');
        dashboardView.reload();
      } else {
        console.log('サーバー接続失敗');
        showNotification('サーバーに接続できません', true);
      }
    })
    .catch(error => {
      console.error('接続チェックエラー:', error);
      showNotification('接続チェックエラー: ' + error.message, true);
    });
}

// サーバー接続チェック
async function checkServerConnection() {
  try {
    console.log('サーバー接続状態を確認中...');
    const response = await window.electronAPI.callBackend('health');
    
    if (response === 'OK') {
      console.log('サーバー接続確認: OK');
      serverConnected = true;
      updateServerStatusUI(true);
      hideServerErrorOverlay();
      return true;
    } else {
      console.warn('サーバー応答が予期しないフォーマット:', response);
      throw new Error('Unexpected response');
    }
  } catch (error) {
    console.error('Server connection check failed:', error);
    serverConnected = false;
    updateServerStatusUI(false);
    handleConnectionError('サーバーに接続できません: ' + error.message);
    return false;
  }
}

// 接続エラー処理
function handleConnectionError(message) {
  hideLoading();
  serverErrorDetails.textContent = message;
  showServerErrorOverlay();
}

// ローディング表示
function showLoading() {
  loadingOverlay.classList.remove('hidden');
}

// ローディング非表示
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// サーバーエラーオーバーレイ表示
function showServerErrorOverlay() {
  serverErrorOverlay.classList.remove('hidden');
}

// サーバーエラーオーバーレイ非表示
function hideServerErrorOverlay() {
  serverErrorOverlay.classList.add('hidden');
}

// 通知表示
function showNotification(message, isError = false) {
  notificationMessage.textContent = message;
  notificationContainer.classList.toggle('error', isError);
  notificationContainer.classList.remove('hidden');
  
  // 5秒後に自動的に非表示
  setTimeout(hideNotification, 5000);
}

// 通知非表示
function hideNotification() {
  notificationContainer.classList.add('hidden');
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', initApp);