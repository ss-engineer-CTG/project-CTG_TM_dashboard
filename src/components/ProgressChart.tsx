import React from 'react';
import { Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { ProgressChartProps } from '../types';

// ChartJSの登録
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const ProgressChart: React.FC<ProgressChartProps> = ({ data, isLoading }) => {
  // ローディング表示
  if (isLoading) {
    return (
      <div className="dashboard-card h-80 flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">グラフをロード中...</div>
      </div>
    );
  }

  // チャートデータの構築
  const chartData = {
    labels: data.ranges,
    datasets: [
      {
        label: 'プロジェクト数',
        data: data.counts,
        backgroundColor: [
          '#60cdff', // 0-25%
          '#50ff96', // 26-50%
          '#ffeb45', // 51-75%
          '#ff5f5f', // 76-99%
          '#ff60d3'  // 100%
        ],
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
      },
    ],
  };

  // チャートオプション
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(45,45,45,0.9)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255,255,255,0.1)'
        },
        ticks: {
          color: '#b3b3b3'
        }
      },
      y: {
        grid: {
          color: 'rgba(255,255,255,0.1)'
        },
        ticks: {
          color: '#b3b3b3'
        },
        beginAtZero: true
      }
    }
  };

  return (
    <div className="dashboard-card h-80">
      <h2 className="text-text-primary text-lg font-medium mb-4">進捗状況分布</h2>
      <div className="h-64">
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};

export default ProgressChart;