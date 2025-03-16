/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export', // 静的エクスポート設定
  images: {
    unoptimized: true, // エクスポート時に必要
  },
  // 開発環境でのAPI通信用プロキシ設定
  async rewrites() {
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