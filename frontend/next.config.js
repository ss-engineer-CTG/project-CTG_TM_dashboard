/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 静的ファイル参照設定
  trailingSlash: true,
  
  // 常に静的ファイルを生成する設定（開発・本番共通）
  output: 'export',
  
  // 静的出力ディレクトリを指定
  distDir: '.next',
  outDir: '../out',
  
  // 画像を最適化しない設定
  images: {
    unoptimized: true,
  },
  
  // 相対パスを使用するための設定（重要）
  assetPrefix: './',
  
  // webpack設定をカスタマイズ
  webpack: (config, { dev, isServer }) => {
    if (!dev) {
      // 本番環境の最適化設定
      config.optimization.minimize = true;
      
      // Terser設定の拡張でコード削減
      if (config.optimization.minimizer) {
        const terserPlugin = config.optimization.minimizer.find(
          plugin => plugin.constructor.name === 'TerserPlugin'
        );
        
        if (terserPlugin) {
          terserPlugin.options.terserOptions = {
            ...terserPlugin.options.terserOptions,
            compress: {
              ...terserPlugin.options.terserOptions?.compress,
              drop_console: true,
              pure_funcs: [
                'console.debug',
                'console.log',
                'console.info',
                'logger.debug',
                'logger.info',
                'logger.log'
              ],
            },
            mangle: true,
          };
        }
      }
      
      // 開発環境でのみ使用するモジュールを削除
      config.resolve.alias = {
        ...config.resolve.alias,
        // 削除対象ファイルを空のモックに置き換え
        './components/ClientInfo': false,
        './components/ConnectionError': false,
        './lib/connection': false,
        './lib/api-init': false,
      };
    }
    
    // 開発モードでも最適化設定を追加
    if (dev) {
      config.optimization = {
        ...config.optimization,
        nodeEnv: 'development',
        minimize: false, // ビルド速度を優先
        splitChunks: {
          cacheGroups: {
            default: false, // デフォルトのチャンク分割を無効化
          },
        },
      };
    }
    
    return config;
  }
}

module.exports = nextConfig