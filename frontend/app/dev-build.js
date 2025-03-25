/* eslint-disable @typescript-eslint/no-require-imports */
// frontend/app/dev-build.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 前回のビルドのハッシュを保存するファイル
const HASH_FILE = path.join(__dirname, '.build-hash');

// ソースファイルのハッシュを計算
function calculateSourceHash() {
  try {
    // Windows と Unix で異なるコマンドを使用
    let filesHash;
    if (process.platform === 'win32') {
      // Windows では dir /b /s を使用
      const files = execSync('dir /b /s /a-d "*.tsx" "*.ts" "*.css"', { cwd: __dirname })
        .toString()
        .trim()
        .split('\r\n')
        .sort();
      
      // ファイル内容を連結してハッシュ化
      const content = files.map(file => {
        try {
          return fs.readFileSync(file, 'utf-8');
        } catch (e) {
          return '';
        }
      }).join('');
      
      filesHash = crypto.createHash('md5').update(content).digest('hex');
    } else {
      // Unix では find を使用
      filesHash = execSync('find . -type f -name "*.tsx" -o -name "*.ts" -o -name "*.css" | sort | xargs cat | md5sum')
        .toString()
        .trim();
    }
    return filesHash;
  } catch (error) {
    console.error('ソースハッシュ計算エラー:', error);
    // エラーの場合はランダムなハッシュを返して必ずビルドが実行されるようにする
    return crypto.randomBytes(16).toString('hex');
  }
}

// 前回のハッシュを取得
function getPreviousHash() {
  if (fs.existsSync(HASH_FILE)) {
    return fs.readFileSync(HASH_FILE, 'utf-8').trim();
  }
  return '';
}

// ハッシュを保存
function saveCurrentHash(hash) {
  fs.writeFileSync(HASH_FILE, hash);
}

// ビルドログファイルを作成
function createBuildLogFile() {
  const logPath = path.join(__dirname, '../../build-log.txt');
  // ファイルが存在する場合はクリア、存在しない場合は作成
  fs.writeFileSync(logPath, 'Build process started\n');
  return logPath;
}

// メイン処理
function main() {
  console.log('変更を確認中...');
  
  const currentHash = calculateSourceHash();
  const previousHash = getPreviousHash();
  
  if (currentHash !== previousHash) {
    console.log('変更を検出しました。再ビルドを開始します...');
    
    // ビルドログファイルの準備
    const logPath = createBuildLogFile();
    
    try {
      // ビルドコマンドを実行（ログファイルにリダイレクト）
      if (process.platform === 'win32') {
        execSync(`cd .. && next build && next export -o ../out >> ${logPath} 2>&1`, { 
          stdio: 'inherit', 
          cwd: __dirname 
        });
      } else {
        execSync(`cd .. && next build && next export -o ../out | tee -a ${logPath}`, { 
          stdio: 'inherit', 
          cwd: __dirname 
        });
      }
      
      console.log('ビルド成功');
      fs.appendFileSync(logPath, 'Export successful\n');
      
      // 成功したらハッシュを保存
      saveCurrentHash(currentHash);
    } catch (error) {
      console.error('ビルドエラー:', error);
      fs.appendFileSync(logPath, `Build error: ${error.message}\n`);
      process.exit(1);
    }
  } else {
    console.log('変更はありません。ビルドをスキップします。');
  }
}

main();