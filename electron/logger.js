/**
 * ログユーティリティ
 * - ファイルへのログ出力機能
 * - コンソールログとファイルログの統合
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor(options = {}) {
    this.options = {
      logToFile: true,
      logLevel: 'info',  // 'debug', 'info', 'warn', 'error'
      maxFileSize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 5,
      ...options
    };
    
    this.logDir = null;
    this.logFile = null;
    this.logStream = null;
    
    // ログ出力レベルの設定
    this.levelMap = {
      'debug': 0,
      'info': 1,
      'warn': 2,
      'error': 3
    };
    
    // 初期化
    this.initialize();
  }
  
  /**
   * ロガーを初期化し、ログディレクトリとファイルを設定
   */
  initialize() {
    if (!this.options.logToFile) return;
    
    try {
      this.logDir = this.getLogDirectory();
      this.logFile = this.getLogFilePath();
      
      // ログディレクトリが存在しない場合は作成
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      
      // ログローテーションの確認
      this.checkLogRotation();
      
      // ファイルストリームの初期化
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      
      // ログ初期化の記録
      this.writeToFile('info', 'Logger initialized');
      
      // Processの終了イベントでロガーを閉じる
      process.on('exit', () => this.close());
    } catch (error) {
      console.error(`Logger initialization error: ${error.message}`);
    }
  }
  
  /**
   * CSVファイルがあるディレクトリからログディレクトリを決定
   * @returns {string} ログディレクトリのパス
   */
  getLogDirectory() {
    let logDir;
    
    try {
      // CSVファイルの場所を特定するための情報の取得
      const appPath = process.env.APP_PATH || '';
      const homeDir = os.homedir();
      
      // 優先順位に基づいてディレクトリを検索
      const possibleDirs = [
        // アプリケーションバンドルパス
        appPath ? path.join(appPath, 'data', 'logs') : null,
        
        // ユーザーのドキュメントなどにあるProjectSuiteフォルダ
        path.join(homeDir, 'Documents', 'ProjectSuite', 'ProjectManager', 'data', 'logs'),
        path.join(homeDir, 'Desktop', 'ProjectSuite', 'ProjectManager', 'data', 'logs'),
        
        // 日本語環境のユーザーフォルダ
        path.join(homeDir, 'ドキュメント', 'ProjectSuite', 'ProjectManager', 'data', 'logs'),
        path.join(homeDir, 'デスクトップ', 'ProjectSuite', 'ProjectManager', 'data', 'logs'),
        
        // フォールバックとして一時ディレクトリ
        path.join(os.tmpdir(), 'project_dashboard', 'logs')
      ].filter(Boolean);
      
      // 最初に見つかったディレクトリ、または最後のフォールバックを使用
      for (const dir of possibleDirs) {
        if (this.isDirectoryWritable(dir)) {
          logDir = dir;
          break;
        }
      }
      
      // ディレクトリが決定できない場合はフォールバックを使用
      if (!logDir) {
        logDir = path.join(os.tmpdir(), 'project_dashboard', 'logs');
      }
      
      return logDir;
    } catch (error) {
      console.error(`Error determining log directory: ${error.message}`);
      // エラー時は一時ディレクトリを使用
      return path.join(os.tmpdir(), 'project_dashboard', 'logs');
    }
  }
  
  /**
   * ディレクトリが書き込み可能かどうかを確認
   * @param {string} dir - 確認するディレクトリのパス
   * @returns {boolean} 書き込み可能な場合はtrue
   */
  isDirectoryWritable(dir) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // テストファイルを書き込んで確認
      const testFile = path.join(dir, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * ログファイルのパスを取得
   * @returns {string} ログファイルのパス
   */
  getLogFilePath() {
    return path.join(this.logDir, 'electron.log');
  }
  
  /**
   * ログローテーションを確認
   */
  checkLogRotation() {
    try {
      if (!fs.existsSync(this.logFile)) return;
      
      const stats = fs.statSync(this.logFile);
      
      // ファイルサイズが上限を超えている場合はローテーション
      if (stats.size > this.options.maxFileSize) {
        this.rotateLogFiles();
      }
    } catch (error) {
      console.error(`Log rotation check error: ${error.message}`);
    }
  }
  
  /**
   * ログファイルをローテーション
   */
  rotateLogFiles() {
    try {
      for (let i = this.options.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }
      }
      
      if (fs.existsSync(this.logFile)) {
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }
    } catch (error) {
      console.error(`Log rotation error: ${error.message}`);
    }
  }
  
  /**
   * ファイルにログを書き込む
   * @param {string} level - ログレベル
   * @param {string} message - ログメッセージ
   */
  writeToFile(level, message) {
    if (!this.options.logToFile || !this.logStream) return;
    
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
      
      this.logStream.write(logEntry);
    } catch (error) {
      console.error(`Error writing to log file: ${error.message}`);
    }
  }
  
  /**
   * ログを出力（コンソールとファイル）
   * @param {string} level - ログレベル
   * @param {string} message - ログメッセージ
   */
  log(level, message) {
    // ログレベルチェック
    if (this.levelMap[level] < this.levelMap[this.options.logLevel]) return;
    
    // コンソールにログを出力
    switch (level) {
      case 'debug':
        console.debug(`\x1b[34m[DEBUG]\x1b[0m ${message}`);
        break;
      case 'info':
        console.log(`\x1b[36m[INFO]\x1b[0m ${message}`);
        break;
      case 'warn':
        console.warn(`\x1b[33m[WARNING]\x1b[0m ${message}`);
        break;
      case 'error':
        console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
        break;
    }
    
    // ファイルにログを書き込む
    this.writeToFile(level, message);
  }
  
  // ログレベル別のメソッド
  debug(message) {
    this.log('debug', message);
  }
  
  info(message) {
    this.log('info', message);
  }
  
  warn(message) {
    this.log('warn', message);
  }
  
  error(message) {
    this.log('error', message);
  }
  
  // ロガーを正常に終了
  close() {
    if (this.logStream) {
      this.writeToFile('info', 'Logger closed');
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// シングルトンインスタンス
let loggerInstance = null;

/**
 * ロガーのシングルトンインスタンスを取得
 * @param {Object} options - ロガーオプション
 * @returns {Logger} ロガーインスタンス
 */
function getLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

module.exports = {
  Logger,
  getLogger
};