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
function copyDirectorySync(source, target, ignorePatterns = []) {
  ensureDirectoryExists(target);
  
  const files = fs.readdirSync(source);
  files.forEach(file => {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    
    // 無視パターンをチェック
    if (ignorePatterns.some(pattern => sourcePath.includes(pattern))) {
      console.log(`Ignored: ${sourcePath}`);
      return;
    }
    
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      copyDirectorySync(sourcePath, targetPath, ignorePatterns);
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  });
}

// データファイルを暗号化する関数 (追加)
function encryptDataFiles() {
  console.log('データファイルの暗号化を開始します...');
  try {
    execSync('node scripts/encrypt_data.js', {
      stdio: 'inherit'
    });
    console.log('データファイルの暗号化が完了しました');
    return true;
  } catch (error) {
    console.error('データファイルの暗号化中にエラーが発生しました:', error.message);
    return false;
  }
}

// バックエンドバイナリの存在確認 (追加)
function verifyBackendBinary() {
  const platformExtension = process.platform === 'win32' ? '.exe' : '';
  const binaryName = `project-dashboard-backend${platformExtension}`;
  const binaryPath = path.join(__dirname, '..', binaryName);
  
  if (fs.existsSync(binaryPath)) {
    console.log(`✅ バックエンドバイナリが見つかりました: ${binaryPath}`);
    return true;
  } else {
    console.warn(`⚠️ バックエンドバイナリが見つかりません: ${binaryPath}`);
    console.warn('パッケージングを続行しますが、バックエンドが動作しない可能性があります');
    return false;
  }
}

// パッケージング設定を最適化 (追加)
function optimizePackagingConfig() {
  console.log('パッケージング設定を最適化しています...');
  
  // package.jsonのビルド設定を読み込む
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // asar設定を確認
  if (!packageJson.build) packageJson.build = {};
  packageJson.build.asar = true;
  
  // asarUnpack設定を最適化
  packageJson.build.asarUnpack = [
    'node_modules/find-process',
    'node_modules/chokidar',
    'build',
    'data'
  ];
  
  // extraResources設定を更新
  packageJson.build.extraResources = [
    {
      "from": process.platform === 'win32' ? "project-dashboard-backend.exe" : "project-dashboard-backend",
      "to": process.platform === 'win32' ? "app.asar.unpacked/project-dashboard-backend.exe" : "app.asar.unpacked/project-dashboard-backend"
    },
    {
      "from": "data",
      "to": "app.asar.unpacked/data",
      "filter": [
        "**/*.enc",
        "!**/__pycache__/**",
        "!**/*.pyc",
        "!**/*.pyo"
      ]
    },
    {
      "from": "build",
      "to": "app.asar.unpacked/build",
      "filter": [
        "**/*"
      ]
    }
  ];
  
  // 更新したpackage.jsonを保存
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('package.json の設定を最適化しました');
}

// メイン実行部分
console.log('Preparing project for packaging...');

// 1. ビルドが存在することを確認
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

// 2. バックエンドバイナリの確認 (追加)
verifyBackendBinary();

// 3. データファイルの暗号化 (追加)
encryptDataFiles();

// 4. パッケージング設定を最適化 (追加)
optimizePackagingConfig();

// 5. パッケージング用のエクストラリソースディレクトリを確保
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
copyDirectorySync(buildDir, tempUnpackedBuildDir, ['.DS_Store', '.git', 'node_modules']);

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