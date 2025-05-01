import React, { useEffect, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ApiProvider } from './contexts/ApiContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { LazyLoadWrapper } from './components/LazyLoadWrapper';
import ErrorBoundary from './components/ErrorBoundary';

// 遅延ロードするコンポーネント
const Notification = lazy(() => import('./components/Notification'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MilestoneDashboard = lazy(() => import('./pages/MilestoneDashboard')); // 追加

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
                <Route path="/" element={
                  <LazyLoadWrapper>
                    <Dashboard />
                  </LazyLoadWrapper>
                } />
                {/* マイルストーンダッシュボードルートを追加 */}
                <Route path="/milestones" element={
                  <LazyLoadWrapper>
                    <MilestoneDashboard />
                  </LazyLoadWrapper>
                } />
              </Routes>
            </Router>
          </ApiProvider>
        </ErrorBoundary>
        <LazyLoadWrapper>
          <Notification />
        </LazyLoadWrapper>
      </NotificationProvider>
    </QueryClientProvider>
  );
};

export default App;