/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 環境に応じた条件付き設定
  ...(process.env.NODE_ENV === 'production' ? {
    // 本番ビルド時のみ静的エクスポートを有効化
    output: 'export',
    images: {
      unoptimized: true,
    },
  } : {}),
  
  // 静的出力時はリライトを完全に無効化
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*', // FastAPIバックエンドへのプロキシ
      },
    ];
  },
  
  // 出力ディレクトリを指定 - Electronとの統一
  distDir: 'out',
}

module.exports = nextConfig