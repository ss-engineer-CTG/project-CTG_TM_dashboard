/**
 * ビルド後処理スクリプト
 * - 不要なファイルの削除
 * - バックエンドバイナリの配置
 * - アセットの最適化
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ロギング関数
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`)
};

// プロジェクトのルートディレクトリを取得
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const unpackedDir = path.join(distDir, 'app.asar.unpacked');
const backendDir = path.join(rootDir, 'backend');

// ファイルをコピーする関数
function copyFile(source, target) {
  try {
    fs.copyFileSync(source, target);
    log.info(`コピー: ${path.basename(source)} -> ${target}`);
  } catch (error) {
    log.error(`ファイルコピーエラー (${source} -> ${target}): ${error.message}`);
    throw error;
  }
}

// ディレクトリが存在しない場合は作成
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    log.info(`ディレクトリを作成: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ファイルまたはディレクトリを削除
function remove(itemPath) {
  try {
    if (fs.existsSync(itemPath)) {
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        log.info(`ディレクトリを削除: ${itemPath}`);
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        log.info(`ファイルを削除: ${itemPath}`);
        fs.unlinkSync(itemPath);
      }
    }
  } catch (error) {
    log.warn(`削除エラー (${itemPath}): ${error.message}`);
  }
}

// バックエンドバイナリを配置
function setupBackendBinary() {
  log.info('バックエンドバイナリを設定しています...');
  
  const platformExtension = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `project-dashboard-backend${platformExtension}`;
  
  const sourcePath = path.join(rootDir, binaryName);
  const targetPath = path.join(unpackedDir, binaryName);
  
  if (!fs.existsSync(sourcePath)) {
    log.error(`バックエンドバイナリが見つかりません: ${sourcePath}`);
    throw new Error('バックエンドバイナリが見つかりません');
  }
  
  // ディレクトリを確保
  ensureDir(unpackedDir);
  
  // バイナリをコピー
  copyFile(sourcePath, targetPath);
  
  // 実行権限を付与（Unix系OSのみ）
  if (process.platform !== 'win32') {
    log.info(`実行権限を付与: ${targetPath}`);
    fs.chmodSync(targetPath, 0o755); // -rwxr-xr-x
  }
  
  log.success('バックエンドバイナリの設定完了');
  return targetPath;
}

// 暗号化されたデータファイルを配置
function setupEncryptedData() {
  log.info('暗号化データファイルを設定しています...');
  
  // データディレクトリを確保
  const dataDir = path.join(unpackedDir, 'data', 'exports');
  ensureDir(dataDir);
  
  // データ暗号化スクリプトを実行
  log.info('データ暗号化スクリプトを実行...');
  try {
    execSync('node scripts/encrypt_data.js --dist --remove-original', {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } catch (error) {
    log.error(`データ暗号化エラー: ${error.message}`);
    throw error;
  }
  
  log.success('暗号化データファイルの設定完了');
}

// 不要なファイルとディレクトリをクリーンアップ
function cleanupFiles() {
  log.info('不要なファイルをクリーンアップしています...');
  
  // クリーンアップするアイテムのリスト
  const itemsToCleanup = [
    // 生のPythonソースコード（バイナリ化したので不要）
    path.join(unpackedDir, 'backend'),
    
    // 中間ビルドファイルやキャッシュ
    path.join(rootDir, 'build'),
    path.join(backendDir, 'build'),
    path.join(backendDir, 'dist'),
    path.join(rootDir, 'project-dashboard-backend' + (process.platform === 'win32' ? '.exe' : '')),
    
    // 開発用ツールや設定ファイル
    path.join(unpackedDir, '.gitignore'),
    path.join(unpackedDir, 'tsconfig.json'),
    path.join(unpackedDir, 'webpack.config.js'),
    path.join(unpackedDir, 'tailwind.config.js'),
  ];
  
  // 各アイテムを削除
  for (const item of itemsToCleanup) {
    remove(item);
  }
  
  log.success('不要なファイルのクリーンアップ完了');
}

// アセット最適化（サイズ削減など）
function optimizeAssets() {
  log.info('アセットを最適化しています...');
  
  try {
    // ここに必要な最適化処理を追加
    // 例: 画像圧縮、JS/CSS圧縮など
    
    log.success('アセット最適化完了');
  } catch (error) {
    log.error(`アセット最適化エラー: ${error.message}`);
    throw error;
  }
}

// メイン実行関数
function main() {
  log.info('=== ビルド後処理を開始します ===');
  
  try {
    // ビルド成果物のディレクトリを確認
    if (!fs.existsSync(distDir)) {
      log.error(`ディストリビューションディレクトリが見つかりません: ${distDir}`);
      throw new Error('ディストリビューションディレクトリが見つかりません');
    }
    
    // 処理ステップを実行
    setupBackendBinary();
    setupEncryptedData();
    optimizeAssets();
    cleanupFiles();
    
    log.success('=== ビルド後処理が完了しました ===');
  } catch (error) {
    log.error(`ビルド後処理中にエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}

// スクリプト実行
main();