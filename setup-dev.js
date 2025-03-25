const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// カラー出力用ユーティリティ
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

console.log(`${colors.cyan}プロジェクト管理ダッシュボード開発環境セットアップ${colors.reset}`);
console.log(`${colors.yellow}----------------------------------------${colors.reset}`);

try {
  // フロントエンドの依存関係インストール
  console.log(`${colors.blue}フロントエンドの依存関係をインストールしています...${colors.reset}`);
  execSync('cd frontend && npm install', { stdio: 'inherit' });
  console.log(`${colors.green}フロントエンドの依存関係のインストールが完了しました${colors.reset}`);

  // ルート依存関係インストール
  console.log(`${colors.blue}ルートの依存関係をインストールしています...${colors.reset}`);
  execSync('npm install', { stdio: 'inherit' });
  console.log(`${colors.green}ルートの依存関係のインストールが完了しました${colors.reset}`);

  // フロントエンドのビルド
  console.log(`${colors.blue}フロントエンドをビルドしています...${colors.reset}`);
  execSync('npm run build', { stdio: 'inherit' });
  console.log(`${colors.green}フロントエンドのビルドが完了しました${colors.reset}`);

  // 開発環境の準備完了
  console.log(`${colors.yellow}----------------------------------------${colors.reset}`);
  console.log(`${colors.green}開発環境のセットアップが完了しました${colors.reset}`);
  console.log(`${colors.cyan}開発サーバーを起動するには: ${colors.reset}npm run electron-dev`);
  console.log(`${colors.cyan}フロントエンドのみを開発するには: ${colors.reset}npm run dev`);
  console.log(`${colors.cyan}既存のビルドでElectronのみを起動するには: ${colors.reset}npm run electron-dev:quick`);
  console.log(`${colors.yellow}----------------------------------------${colors.reset}`);

} catch (error) {
  console.error(`${colors.red}セットアップ中にエラーが発生しました: ${error.message}${colors.reset}`);
  process.exit(1);
}