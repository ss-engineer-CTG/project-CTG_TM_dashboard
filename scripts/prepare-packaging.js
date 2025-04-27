const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 必要なディレクトリを作成する関数
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ファイルをコピーする関数
function copyFileSync(source, target) {
  const targetDir = path.dirname(target);
  ensureDirectoryExists(targetDir);
  fs.copyFileSync(source, target);
  console.log(`Copied: ${source} -> ${target}`);
}

// ディレクトリを再帰的にコピーする関数
function copyDirectorySync(source, target) {
  ensureDirectoryExists(target);
  
  const files = fs.readdirSync(source);
  files.forEach(file => {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      copyDirectorySync(sourcePath, targetPath);
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  });
}

// メイン実行部分
console.log('Preparing project for packaging...');

// ビルドが存在することを確認
const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  console.error('Build directory does not exist! Running build...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// パッケージング用のエクストラリソースディレクトリを確保
console.log('Ensuring all necessary directories are set up correctly...');

// app.asar.unpacked/build ディレクトリ構造をシミュレートして確認
const tempUnpackedDir = path.join(__dirname, '..', 'temp-unpacked');
const tempUnpackedBuildDir = path.join(tempUnpackedDir, 'build');

// 既存の一時ディレクトリをクリア
if (fs.existsSync(tempUnpackedDir)) {
  console.log('Cleaning up temporary directory...');
  fs.rmSync(tempUnpackedDir, { recursive: true, force: true });
}

// build ディレクトリを一時ディレクトリにコピー
console.log('Copying build files to temporary location for verification...');
copyDirectorySync(buildDir, tempUnpackedBuildDir);

// ビルドファイルが正しくコピーされたことを確認
const indexHtmlPath = path.join(tempUnpackedBuildDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  console.log('✅ Build files verified successfully!');
} else {
  console.error('❌ Build verification failed! index.html not found in the build directory.');
  process.exit(1);
}

// 一時ディレクトリをクリーンアップ
console.log('Cleaning up...');
fs.rmSync(tempUnpackedDir, { recursive: true, force: true });

console.log('✅ Project successfully prepared for packaging!');
console.log('You can now run: npm run electron-pack:win');