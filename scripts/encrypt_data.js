/**
 * データ暗号化スクリプト
 * - CSVやJSONなどのデータファイルを暗号化
 * - ビルド時またはパッケージング時に実行
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ロギング関数
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`)
};

// プロジェクトのルートディレクトリを取得
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data', 'exports');
const distDataDir = path.join(rootDir, 'dist', 'app.asar.unpacked', 'data', 'exports');

// 暗号化キー（本番環境ではより安全な方法で管理）
// 実際の実装ではハードコードせず、環境変数や安全なキーストアから取得
const ENCRYPTION_KEY = process.env.CRYPTO_KEY || 'THIS_IS_A_DEVELOPMENT_KEY_REPLACE_IN_PRODUCTION';
const ENCRYPTION_IV_LENGTH = 16;

// データファイルの暗号化
function encryptFile(inputPath, outputPath = null) {
  try {
    if (!outputPath) {
      outputPath = inputPath + '.enc';
    }
    
    // ファイルを読み込み
    const data = fs.readFileSync(inputPath);
    
    // 初期化ベクトル（IV）を生成
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    
    // 暗号化キーからハッシュを生成（32バイト = 256ビット）
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    
    // 暗号化器を作成
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    // データを暗号化
    let encrypted = Buffer.concat([
      iv,
      cipher.update(data),
      cipher.final()
    ]);
    
    // 暗号化されたデータをファイルに書き込み
    fs.writeFileSync(outputPath, encrypted);
    
    log.success(`ファイルを暗号化しました: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
    return outputPath;
  } catch (error) {
    log.error(`ファイルの暗号化中にエラーが発生しました (${inputPath}): ${error.message}`);
    throw error;
  }
}

// 指定されたディレクトリ内のCSVとJSONファイルを暗号化
function encryptDataFiles(directory, outputDirectory = null) {
  if (!fs.existsSync(directory)) {
    log.warn(`ディレクトリが存在しません: ${directory}`);
    return [];
  }
  
  if (outputDirectory && !fs.existsSync(outputDirectory)) {
    log.info(`出力ディレクトリを作成: ${outputDirectory}`);
    fs.mkdirSync(outputDirectory, { recursive: true });
  }
  
  const files = fs.readdirSync(directory);
  const encryptedFiles = [];
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      const ext = path.extname(file).toLowerCase();
      
      // CSVまたはJSONファイルのみを暗号化
      if (ext === '.csv' || ext === '.json') {
        try {
          const outputPath = outputDirectory 
            ? path.join(outputDirectory, file + '.enc')
            : filePath + '.enc';
            
          encryptFile(filePath, outputPath);
          encryptedFiles.push(outputPath);
        } catch (error) {
          log.warn(`ファイル ${file} の暗号化をスキップします: ${error.message}`);
        }
      }
    } else if (stats.isDirectory()) {
      // サブディレクトリを再帰的に処理
      const subOutputDir = outputDirectory 
        ? path.join(outputDirectory, file)
        : null;
        
      const subEncrypted = encryptDataFiles(filePath, subOutputDir);
      encryptedFiles.push(...subEncrypted);
    }
  }
  
  return encryptedFiles;
}

// メイン実行関数
function main() {
  log.info('=== データファイルの暗号化を開始します ===');
  
  try {
    // 出力ディレクトリの確認と作成
    const targetDir = process.argv[2] === '--dist' ? distDataDir : dataDir;
    
    if (process.argv[2] === '--dist' && !fs.existsSync(targetDir)) {
      log.info(`ディストリビューション用データディレクトリを作成: ${targetDir}`);
      fs.mkdirSync(targetDir, { recursive: true });
      
      // 本番用データをコピー
      log.info('データファイルをディストリビューションディレクトリにコピーします...');
      
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
          const srcPath = path.join(dataDir, file);
          const destPath = path.join(targetDir, file);
          
          if (fs.statSync(srcPath).isFile()) {
            fs.copyFileSync(srcPath, destPath);
            log.info(`コピー: ${file}`);
          }
        }
      }
    }
    
    // データファイルを暗号化
    log.info(`${targetDir} 内のデータファイルを暗号化します...`);
    const encryptedFiles = encryptDataFiles(targetDir);
    
    if (encryptedFiles.length > 0) {
      log.success(`合計 ${encryptedFiles.length} 個のファイルを暗号化しました`);
      
      // 暗号化成功後、オリジナルファイルを削除するオプション
      if (process.argv.includes('--remove-original')) {
        log.info('オリジナルファイルを削除します...');
        for (const encFile of encryptedFiles) {
          const originalFile = encFile.replace(/\.enc$/, '');
          if (fs.existsSync(originalFile)) {
            fs.unlinkSync(originalFile);
            log.info(`削除: ${path.basename(originalFile)}`);
          }
        }
      }
    } else {
      log.warn('暗号化するデータファイルが見つかりませんでした');
    }
    
    log.success('=== データファイルの暗号化が完了しました ===');
  } catch (error) {
    log.error(`データファイルの暗号化中にエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}

// スクリプト実行
main();