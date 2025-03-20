import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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
  // CSP設定をより単純な形式で定義
  const isDev = process.env.NODE_ENV === 'development';
  
  // 開発環境と本番環境で異なるCSP設定
  const cspContent = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; font-src 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:*; font-src 'self';";

  return (
    <html lang="ja">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={cspContent} />
      </head>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}