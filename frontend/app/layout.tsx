import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NotificationProvider } from '@/contexts/NotificationContext';
import Notification from '@/components/Notification';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'プロジェクト進捗ダッシュボード',
  description: 'プロジェクト管理ダッシュボードアプリケーション',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <Providers>
          <NotificationProvider>
            {children}
            <Notification />
          </NotificationProvider>
        </Providers>
      </body>
    </html>
  );
}