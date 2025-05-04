const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

// 共通設定
const commonConfig = {
  entry: './src/index.tsx',
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              experimentalWatchApi: true
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  require('tailwindcss'),
                  require('autoprefixer')
                ]
              }
            }
          }
        ]
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name].[hash:8][ext]'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name].[hash:8][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/public/index.html',
      favicon: './src/public/favicon.ico',
      inject: true
    }),
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configFile: 'tsconfig.json',
        mode: 'write-references'
      }
    })
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
      name: false,
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    },
    runtimeChunk: {
      name: entrypoint => `runtime-${entrypoint.name}`
    }
  }
};

// 本番用設定
const productionConfig = {
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'js/[name].[contenthash:8].js',
    chunkFilename: 'js/[name].[contenthash:8].chunk.js',
    publicPath: './'
  },
  devtool: 'source-map',
  plugins: [], // 明示的に空配列で初期化
  optimization: {
    minimize: true,
    // 本番用の最適化設定を追加
    minimizer: [
      '...',  // webpack 5のデフォルトminimizer（TerserPlugin）を使用
    ],
    moduleIds: 'deterministic',
    innerGraph: true,
    usedExports: true, // Tree Shakingを有効化
    sideEffects: true, // sideEffectsフラグを尊重
  },
  performance: {
    hints: 'warning',
    maxAssetSize: 512000,
    maxEntrypointSize: 512000
  }
};

// 開発用設定
const developmentConfig = {
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'js/[name].js',
    chunkFilename: 'js/[name].chunk.js',
    publicPath: './'
  },
  devtool: 'cheap-module-source-map',
  plugins: [], // 明示的に空配列で初期化
  optimization: {
    minimize: false
  },
  performance: {
    hints: false
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'build')
    },
    compress: true,
    port: 3000,
    // 核心的な設計方針に沿うための変更
    hot: false,
    liveReload: false,
    open: false,
    historyApiFallback: true
  },
  stats: {
    children: false,
    modules: false
  },
  watchOptions: {
    ignored: /node_modules/
  }
};

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  // 環境変数で分析モードを制御
  if (isProduction && env && env.analyze) {
    productionConfig.plugins.push(new BundleAnalyzerPlugin());
  }
  
  // 共通設定をベースに、環境に応じた設定をマージ
  return {
    ...commonConfig,
    ...(isProduction ? productionConfig : developmentConfig),
    // 特定の環境でのみ必要な設定を上書きではなく、条件付きで追加
    plugins: [
      ...commonConfig.plugins,
      ...(isProduction ? productionConfig.plugins : developmentConfig.plugins)
    ]
  };
};