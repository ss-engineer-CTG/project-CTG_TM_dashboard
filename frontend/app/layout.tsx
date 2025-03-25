import './globals.css';
// import { Inter } from 'next/font/google';
import { Providers } from './providers';

// const inter = Inter({ subsets: ['latin'] });

export const metadata = {
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
      {/*<body className={inter.className}>*/}
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}