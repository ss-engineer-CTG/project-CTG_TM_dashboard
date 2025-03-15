'use client';

import React from 'react';
import { DashboardSummary } from '@/types/dashboard';
import { FiBox, FiActivity, FiAlertTriangle, FiFlag } from 'react-icons/fi';

interface SummaryCardsProps {
  summary: DashboardSummary | null;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  if (!summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-32 animate-pulse">
            <div className="h-5 bg-gray-700 rounded w-1/2 mb-4"></div>
            <div className="h-10 bg-gray-700 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: '総プロジェクト数',
      value: summary.total_projects,
      icon: <FiBox className="text-2xl" />,
      color: 'text-light-primary',
    },
    {
      title: '進行中',
      value: summary.active_projects,
      icon: <FiActivity className="text-2xl" />,
      color: 'text-info',
    },
    {
      title: '遅延あり',
      value: summary.delayed_projects,
      icon: <FiAlertTriangle className="text-2xl" />,
      color: 'text-danger',
    },
    {
      title: '今月のマイルストーン',
      value: summary.milestone_projects,
      icon: <FiFlag className="text-2xl" />,
      color: 'text-warning',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <div key={index} className="card flex flex-col justify-between">
          <div className="flex items-center">
            <div className={`${card.color} mr-3`}>{card.icon}</div>
            <h3 className="text-light-secondary">{card.title}</h3>
          </div>
          <h2 className={`text-3xl font-bold mt-4 ${card.color}`}>
            {card.value}
          </h2>
        </div>
      ))}
    </div>
  );
}