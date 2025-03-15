import './globals.css';
import type { Metadata } from 'next';
import { DashboardProvider } from '@/contexts/DashboardContext';

export const metadata: Metadata = {
  title: 'プロジェクト進捗ダッシュボード',
  description: 'プロジェクト管理および進捗追跡ダッシュボード',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <DashboardProvider>
          {children}
        </DashboardProvider>
      </body>
    </html>
  );
}