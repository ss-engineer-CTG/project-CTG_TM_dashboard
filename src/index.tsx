import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';

// アプリケーションロード最適化
const renderApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('ルート要素が見つかりません');
    return;
  }
  
  const root = ReactDOM.createRoot(rootElement);
  
  // パフォーマンス計測
  if (typeof window !== 'undefined') {
    window.performance.mark('app_init_start');
  }
  
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
};

// DOM読み込み完了を確認
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderApp);
} else {
  renderApp();
}