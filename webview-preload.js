// WebView内部のプリロードスクリプト
// Dash アプリと Electron の間の通信ブリッジとして機能

// DOMが読み込まれた後に実行
window.addEventListener('DOMContentLoaded', () => {
    console.log('WebView preload script executed');
    
    // デバッグ: DOM要素が表示されているか確認
    setTimeout(() => {
      const elements = document.querySelectorAll('*');
      console.log(`WebView contains ${elements.length} DOM elements`);
      
      // body要素を見つける
      const body = document.querySelector('body');
      if (body) {
        console.log('Body element found in WebView');
        
        // デバッグ用ボーダー（正常に読み込まれているか視覚的に確認）
        body.style.border = '3px solid #60cdff';
        
        // ダッシュボード要素の有無をチェック
        const dashboardElements = document.querySelectorAll('.dash-graph, table, .dash-spreadsheet');
        console.log(`Found ${dashboardElements.length} dashboard elements`);
        
        if (dashboardElements.length === 0) {
          console.warn('No dashboard elements found - possible rendering issue');
        }
      } else {
        console.warn('No body element found in WebView');
      }
    }, 2000); // 2秒後に実行（ページの読み込みに余裕を持たせる）
    
    // Electronとの通信ブリッジをセットアップ
    window.electronBridge = {
      // メッセージを親プロセスに送信
      notify: (message) => {
        window.parent.postMessage({ type: 'notification', message }, '*');
      },
      
      // WebView内でのエラーを報告
      reportError: (error) => {
        console.error('WebView error:', error);
        window.parent.postMessage({ 
          type: 'error', 
          message: error.toString() 
        }, '*');
      }
    };
    
    // エラーをキャッチしてElectronに送信
    window.addEventListener('error', (event) => {
      window.electronBridge.reportError(event.error || event.message);
    });
    
    // Promise拒否をキャッチ
    window.addEventListener('unhandledrejection', (event) => {
      window.electronBridge.reportError(event.reason);
    });
    
    // DashからのデータロードイベントをElectronに通知
    const observeDataLoading = () => {
      // MutationObserverを使用してDOMの変更を監視
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && 
              (mutation.target.classList.contains('dash-graph') || 
               mutation.target.classList.contains('dash-spreadsheet'))) {
            window.electronBridge.notify('dashboard-content-updated');
          }
        }
      });
      
      // document全体を監視
      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
    };
    
    // ページが完全に読み込まれた後に監視を開始
    window.addEventListener('load', () => {
      console.log('WebView content fully loaded');
      observeDataLoading();
      
      // Dashアプリが読み込まれたことを親ウィンドウに通知
      window.parent.postMessage({ type: 'dash-loaded' }, '*');
    });
  });