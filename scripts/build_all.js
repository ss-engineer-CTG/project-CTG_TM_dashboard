/**
 * 統合ビルドスクリプト
 * - バックエンドとフロントエンドの両方を一度にビルド
 * - 本番環境用の設定を適用
 */

const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ロギング関数
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`)
};

// プロジェクトのルートディレクトリを取得
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const scriptsDir = path.join(rootDir, 'scripts');

// 環境変数を設定
process.env.NODE_ENV = 'production';
process.env.BUILD_ENV = 'production';

// ビルドステップを管理
const buildSteps = {
  // ビルド前のクリーンアップ
  async clean() {
    log.info('クリーンアップを開始します...');
    try {
      // ビルドディレクトリを削除
      const dirsToClean = ['build', 'dist', 'backend/build', 'backend/dist'];
      
      for (const dir of dirsToClean) {
        const fullPath = path.join(rootDir, dir);
        if (fs.existsSync(fullPath)) {
          log.info(`ディレクトリを削除: ${fullPath}`);
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
      
      log.success('クリーンアップ完了');
      return true;
    } catch (error) {
      log.error(`クリーンアップ中にエラーが発生しました: ${error.message}`);
      return false;
    }
  },
  
  // バックエンドのビルド
  async buildBackend() {
    log.info('バックエンドのビルドを開始します...');
    
    try {
      // 必要なパッケージのインストール
      log.info('バックエンド依存関係をインストールしています...');
      execSync('pip install -r requirements.txt', {
        cwd: backendDir,
        stdio: 'inherit'
      });
      
      execSync('pip install pyinstaller', {
        stdio: 'inherit'
      });
      
      // PyInstallerでバックエンドをビルド
      log.info('PyInstallerでバックエンドをビルドしています...');
      
      // OSに応じたビルドスクリプトを実行
      if (os.platform() === 'win32') {
        execSync('build_backend.bat', {
          cwd: backendDir,
          stdio: 'inherit'
        });
      } else {
        execSync('chmod +x build_backend.sh', {
          cwd: backendDir
        });
        
        execSync('./build_backend.sh', {
          cwd: backendDir,
          stdio: 'inherit'
        });
      }
      
      log.success('バックエンドのビルド完了');
      return true;
    } catch (error) {
      log.error(`バックエンドのビルド中にエラーが発生しました: ${error.message}`);
      return false;
    }
  },
  
  // フロントエンドのビルド
  async buildFrontend() {
    log.info('フロントエンドのビルドを開始します...');
    
    try {
      // npmパッケージのインストール
      log.info('フロントエンド依存関係をインストールしています...');
      execSync('npm install', {
        cwd: rootDir,
        stdio: 'inherit'
      });
      
      // ウェブパックでフロントエンドをビルド
      log.info('webpackでフロントエンドをビルドしています...');
      execSync('npm run build', {
        cwd: rootDir,
        stdio: 'inherit'
      });
      
      log.success('フロントエンドのビルド完了');
      return true;
    } catch (error) {
      log.error(`フロントエンドのビルド中にエラーが発生しました: ${error.message}`);
      return false;
    }
  },
  
  // Electronアプリのパッケージング
  async packageElectron() {
    log.info('Electronアプリのパッケージングを開始します...');
    
    try {
      // パッケージング前の準備
      log.info('パッケージングの準備をしています...');
      execSync('node scripts/prepare-packaging.js', {
        cwd: rootDir,
        stdio: 'inherit'
      });
      
      // electron-builderでパッケージング
      log.info('electron-builderでパッケージングしています...');
      
      // OSに応じたパッケージングコマンドを実行
      if (os.platform() === 'win32') {
        execSync('npm run electron-pack:win', {
          cwd: rootDir,
          stdio: 'inherit'
        });
      } else if (os.platform() === 'darwin') {
        execSync('npm run electron-pack:mac', {
          cwd: rootDir,
          stdio: 'inherit'
        });
      } else {
        execSync('npm run electron-pack:linux', {
          cwd: rootDir,
          stdio: 'inherit'
        });
      }
      
      log.success('Electronアプリのパッケージング完了');
      return true;
    } catch (error) {
      log.error(`パッケージング中にエラーが発生しました: ${error.message}`);
      return false;
    }
  },
  
  // ビルド後の処理
  async postBuild() {
    log.info('ビルド後の処理を開始します...');
    
    try {
      // post_build.jsスクリプトを実行
      log.info('post_build.jsを実行しています...');
      execSync('node scripts/post_build.js', {
        cwd: rootDir,
        stdio: 'inherit'
      });
      
      log.success('ビルド後の処理完了');
      return true;
    } catch (error) {
      log.error(`ビルド後の処理中にエラーが発生しました: ${error.message}`);
      return false;
    }
  }
};

// メイン実行関数
async function main() {
  log.info('=== プロジェクト統合ビルドを開始します ===');
  const startTime = Date.now();
  
  // ビルドプロセスを順番に実行
  const steps = [
    { name: 'クリーンアップ', fn: buildSteps.clean },
    { name: 'バックエンドビルド', fn: buildSteps.buildBackend },
    { name: 'フロントエンドビルド', fn: buildSteps.buildFrontend },
    { name: 'Electronパッケージング', fn: buildSteps.packageElectron },
    { name: 'ビルド後処理', fn: buildSteps.postBuild }
  ];
  
  let success = true;
  
  for (const step of steps) {
    log.info(`ステップ: ${step.name}を実行中...`);
    const stepResult = await step.fn();
    
    if (!stepResult) {
      log.error(`ステップ: ${step.name}に失敗しました`);
      success = false;
      break;
    }
    
    log.success(`ステップ: ${step.name}が完了しました`);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (success) {
    log.success(`=== プロジェクト統合ビルドが完了しました (${duration}秒) ===`);
    log.info('ビルドされたアプリケーションは dist/ ディレクトリにあります');
  } else {
    log.error(`=== プロジェクト統合ビルドが失敗しました (${duration}秒) ===`);
    process.exit(1);
  }
}

// スクリプト実行
main().catch(error => {
  log.error(`予期せぬエラーが発生しました: ${error.message}`);
  process.exit(1);
});