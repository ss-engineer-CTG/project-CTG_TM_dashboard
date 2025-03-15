'use client';

import React from 'react';
import { ChartData } from '@/types/dashboard';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';

// ChartJSの登録
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ChartSectionProps {
  progressDistribution: ChartData | null;
  durationDistribution: ChartData | null;
}

export default function ChartSection({
  progressDistribution,
  durationDistribution,
}: ChartSectionProps) {
  // チャートの共通オプション
  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        bodyFont: {
          family: 'Geist, sans-serif'
        },
        titleFont: {
          family: 'Geist, sans-serif'
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: 'rgba(179, 179, 179, 0.9)',
          font: {
            family: 'Geist, sans-serif'
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
      },
      x: {
        ticks: {
          color: 'rgba(179, 179, 179, 0.9)',
          font: {
            family: 'Geist, sans-serif'
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
      },
    },
  };

  // 進捗分布チャートデータ
  const progressChartData = progressDistribution
    ? {
        labels: progressDistribution.labels,
        datasets: [
          {
            data: progressDistribution.data,
            backgroundColor: [
              'rgba(96, 205, 255, 0.8)', // info
              'rgba(80, 255, 150, 0.8)', // success
              'rgba(255, 235, 69, 0.8)', // warning
              'rgba(255, 95, 95, 0.8)', // danger
              'rgba(200, 200, 200, 0.8)', // neutral
            ],
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
          },
        ],
      }
    : null;

  // 期間分布チャートデータ
  const durationChartData = durationDistribution
    ? {
        labels: durationDistribution.labels,
        datasets: [
          {
            data: durationDistribution.data,
            backgroundColor: 'rgba(80, 255, 150, 0.8)', // success
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
          },
        ],
      }
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="card">
        <h2 className="text-xl font-bold mb-4">進捗状況分布</h2>
        <div className="h-72">
          {progressChartData ? (
            <Bar data={progressChartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-light-secondary">
              データがありません
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">プロジェクト期間分布</h2>
        <div className="h-72">
          {durationChartData ? (
            <Bar data={durationChartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-light-secondary">
              データがありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}