import React, { memo, useState, useEffect } from 'react';
import { DashboardChartsProps } from '../types';
import ProgressChart from './ProgressChart';
import DurationChart from './DurationChart';

// パフォーマンス計測
if (typeof window !== 'undefined') {
  window.performance.mark('dashboard_charts_init');
}

const DashboardCharts: React.FC<DashboardChartsProps> = memo(({ metrics, isLoading }) => {
  // リソース読み込み状態を表す内部状態
  const [chartsReady, setChartsReady] = useState(false);
  
  // マウント後に遅延してチャート準備完了フラグを設定（レンダリング最適化）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.performance.mark('dashboard_charts_mounted');
      window.performance.measure(
        'dashboard_charts_initial_render',
        'dashboard_charts_init',
        'dashboard_charts_mounted'
      );
    }
    
    // リソース読み込みの準備が整ったら状態を更新
    const timer = setTimeout(() => {
      setChartsReady(true);
      
      if (typeof window !== 'undefined') {
        window.performance.mark('dashboard_charts_ready');
        window.performance.measure(
          'dashboard_charts_ready_time',
          'dashboard_charts_mounted',
          'dashboard_charts_ready'
        );
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // ローディング表示 - スケルトンコンポーネント
  if (isLoading || !chartsReady) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="dashboard-card h-80 flex items-center justify-center">
          <div className="animate-pulse text-text-secondary">グラフをロード中...</div>
        </div>
        <div className="dashboard-card h-80 flex items-center justify-center">
          <div className="animate-pulse text-text-secondary">グラフをロード中...</div>
        </div>
      </div>
    );
  }
  
  // データのバリデーション - 無効なデータの場合はプレースホルダーを表示
  const hasValidProgressData = metrics?.progress_distribution?.ranges?.length > 0 && 
                              metrics?.progress_distribution?.counts?.length > 0;
  
  const hasValidDurationData = metrics?.duration_distribution?.ranges?.length > 0 && 
                              metrics?.duration_distribution?.counts?.length > 0;
  
  // チャートデータのメモ化による最適化
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {hasValidProgressData ? (
        <ProgressChart 
          data={metrics.progress_distribution} 
          isLoading={false} 
        />
      ) : (
        <div className="dashboard-card h-80 flex items-center justify-center">
          <div className="text-text-secondary">進捗データがありません</div>
        </div>
      )}
      
      {hasValidDurationData ? (
        <DurationChart 
          data={metrics.duration_distribution} 
          isLoading={false} 
        />
      ) : (
        <div className="dashboard-card h-80 flex items-center justify-center">
          <div className="text-text-secondary">期間データがありません</div>
        </div>
      )}
    </div>
  );
});

// 開発モードでのデバッグ用コンポーネント名設定
DashboardCharts.displayName = 'DashboardCharts';

export default DashboardCharts;