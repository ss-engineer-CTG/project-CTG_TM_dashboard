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
  
  // 開発環境でのAPI通信用プロキシ設定
  async rewrites() {
    // 開発環境でのみリライトを有効化
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/api/:path*',
            destination: 'http://127.0.0.1:8000/api/:path*', // FastAPIバックエンドへのプロキシ
          },
        ]
      : [];
  },
  
  // 出力ディレクトリを指定 - Electronとの統一
  distDir: 'out',
  
  // publicディレクトリの指定
  assetPrefix: '',
}

module.exports = nextConfig