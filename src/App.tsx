import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ApiProvider } from './contexts/ApiContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Notification from './components/Notification';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';

const App: React.FC = () => {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5, // 5分間
        cacheTime: 1000 * 60 * 30, // 30分間
      },
    },
  }));

  // OSのダークモード/ライトモード検出
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      // ダークモード/ライトモードの切り替え処理
      document.documentElement.classList.toggle('dark', e.matches);
    };
    
    // 初期値設定
    document.documentElement.classList.toggle('dark', mediaQuery.matches);
    
    // 変更検知
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <ErrorBoundary>
          <ApiProvider>
            <Router>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                {/* 将来的に追加するページはここに追加 */}
              </Routes>
            </Router>
          </ApiProvider>
        </ErrorBoundary>
        <Notification />
      </NotificationProvider>
    </QueryClientProvider>
  );
};

export default App;