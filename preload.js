const { contextBridge, ipcRenderer } = require('electron');
const http = require('http');

// HTTPリクエスト関数（XHRベース - ブラウザ互換）
function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url, true);
    
    // ヘッダー設定
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (options.headers) {
      Object.keys(options.headers).forEach(key => {
        xhr.setRequestHeader(key, options.headers[key]);
      });
    }
    
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => Promise.resolve(JSON.parse(xhr.responseText)),
        text: () => Promise.resolve(xhr.responseText),
        headers: {
          get: (name) => xhr.getResponseHeader(name)
        }
      });
    };
    
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Request timed out"));
    
    // リクエスト送信
    xhr.send(options.body ? options.body : null);
  });
}

// NodeのHTTPモジュールを使ったリクエスト関数
function makeNodeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };
    
    const req = http.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
          headers: {
            get: (name) => res.headers[name.toLowerCase()]
          }
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// レンダラープロセスに公開する安全なAPIのセット
contextBridge.exposeInMainWorld('electronAPI', {
  // ファイル選択ダイアログを開く
  selectFile: () => ipcRenderer.invoke('select-file'),
  
  // Pythonサーバーのステータス変更を購読
  onPythonServerStatusChange: (callback) => {
    ipcRenderer.on('python-server-status', (event, status) => callback(status));
    return () => {
      ipcRenderer.removeAllListeners('python-server-status');
    };
  },
  
  // アプリケーションのバージョン情報を取得
  getAppVersion: () => {
    return require('./package.json').version;
  },
  
  // Pythonバックエンドに対するHTTPリクエストのヘルパー
  async callBackend(endpoint, method = 'GET', data = null) {
    const url = `http://localhost:8050/${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }
    
    try {
      // マルチステップ試行アプローチ
      let response;
      
      // 1. まずXHRベースの実装を試す
      try {
        console.log(`Calling backend (${method} ${endpoint}) with XHR...`);
        response = await makeHttpRequest(url, options);
      } catch (xhrError) {
        console.log(`XHR failed: ${xhrError.message}, trying node-http...`);
        
        // 2. XHRが失敗したらNodeHTTPを試す
        try {
          response = await makeNodeHttpRequest(url, options);
        } catch (nodeHttpError) {
          console.error(`Node HTTP also failed: ${nodeHttpError.message}`);
          throw nodeHttpError; // 両方失敗したら例外
        }
      }
      
      // レスポンス処理
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // コンテンツタイプに基づいて結果を返す
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`Backend call error (${endpoint}):`, error);
      throw error;
    }
  }
});