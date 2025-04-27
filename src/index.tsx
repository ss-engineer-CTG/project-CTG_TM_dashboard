import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';

// アプリケーションロード最適化 - 改良バージョン
const renderApp = () => {
  // パフォーマンス計測
  if (typeof window !== 'undefined') {
    window.performance.mark('app_init_start');
  }
  
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('ルート要素が見つかりません');
    return;
  }
  
  const root = ReactDOM.createRoot(rootElement);
  
  // 先に最小限のロード画面を表示して体感速度を向上
  root.render(
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-text-primary text-xl">アプリケーションを読み込み中...</div>
    </div>
  );
  
  // アプリをミリ秒単位の遅延で非同期的に読み込む
  setTimeout(() => {
    // アプリ使用準備通知用コンポーネント
    const AppWithReadyNotification = () => {
      React.useEffect(() => {
        // アプリロード完了イベント発生
        window.dispatchEvent(new Event('react-app-ready'));
        
        // Electronにロード完了を通知
        if (typeof window !== 'undefined' && window.electron) {
          const readyEvent = new CustomEvent('app-ready');
          document.dispatchEvent(readyEvent);
        }
        
        // パフォーマンス計測終了
        if (typeof window !== 'undefined') {
          window.performance.mark('app_init_complete');
          window.performance.measure('app_initialization', 'app_init_start', 'app_init_complete');
          
          // 開発環境でのみログ出力
          if (process.env.NODE_ENV === 'development') {
            const measure = window.performance.getEntriesByName('app_initialization')[0];
            console.log(`アプリケーション初期化完了: ${measure.duration.toFixed(2)}ms`);
          }
        }
        
        console.log('アプリケーションの準備完了');
      }, []);
      
      return <App />;
    };
    
    root.render(
      <React.StrictMode>
        <AppWithReadyNotification />
      </React.StrictMode>
    );
  }, 0);
};

// DOMの状態を確認し、早期にアプリケーション起動準備
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderApp);
} else {
  // DOMがすでに読み込まれている場合は即時実行
  renderApp();
}