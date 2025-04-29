/**
 * バックエンドプロセスの管理を行うユーティリティ
 * プロセスの起動、終了、クリーンアップを担当します
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const findProcess = require('find-process');
const axios = require('axios');

class ProcessManager {
  constructor() {
    this.currentProcess = null;
    this.isCleanupInProgress = false;
    this.isRestartInProgress = false;
    this.pidFilePath = path.join(os.tmpdir(), 'project_dashboard_pids.txt');
    this.portFilePath = path.join(os.tmpdir(), 'project_dashboard_port.txt');
  }
  
  /**
   * バックエンドプロセスを起動します
   * @param {string} pythonPath - Python実行ファイルのパス
   * @param {string} scriptPath - 実行するPythonスクリプトのパス
   * @param {number} port - 使用するポート番号
   * @param {Object} options - 追加のオプション
   * @returns {ChildProcess} - 起動したプロセス
   */
  startProcess(pythonPath, scriptPath, port, options = {}) {
    console.log(`バックエンドサーバーを起動します: ${pythonPath} ${scriptPath} ${port}`);
    
    // 環境変数を設定
    const envVars = {
      ...process.env,
      PYTHONPATH: path.dirname(path.dirname(scriptPath)),
      USE_ELECTRON_DIALOG: "true",
      PYTHONIOENCODING: "utf-8",
      PYTHONLEGACYWINDOWSSTDIO: "1",
      ELECTRON_PORT: port.toString(),
      API_PORT: port.toString(),
      PYTHONOPTIMIZE: "1",
      FASTAPI_STARTUP_OPTIMIZE: "1",
      STREAMLINED_LOGGING: "1",
      DEBUG: options.debug ? "1" : "0",
      SYSTEM_HEALTH_ENABLED: "1" // 新機能を有効化
    };
    
    // プロセスを起動
    this.currentProcess = spawn(pythonPath, [scriptPath, port.toString()], {
      stdio: 'pipe',
      detached: false,
      cwd: path.dirname(path.dirname(scriptPath)),
      env: envVars
    });
    
    // PIDトラッキング用のファイルに書き込み
    if (this.currentProcess && this.currentProcess.pid) {
      try {
        fs.writeFileSync(this.pidFilePath, this.currentProcess.pid.toString());
        console.log(`プロセスID ${this.currentProcess.pid} をトラッキングファイルに保存しました`);
      } catch (err) {
        console.warn('PIDトラッキングファイルの書き込みに失敗:', err.message);
      }
    }
    
    // ポート情報を保存
    try {
      fs.writeFileSync(this.portFilePath, port.toString());
      console.log(`ポート ${port} を一時ファイルに保存しました`);
    } catch (err) {
      console.warn('ポート情報ファイルの保存に失敗:', err.message);
    }
    
    // UTF-8エンコーディングを設定
    this.currentProcess.stdout.setEncoding('utf-8');
    this.currentProcess.stderr.setEncoding('utf-8');
    
    return this.currentProcess;
  }
  
  /**
   * バックエンドプロセスを終了します
   * @param {number} port - プロセスが使用しているポート
   * @returns {Promise<boolean>} - 成功したらtrue
   */
  async stopProcess(port) {
    if (!this.currentProcess) {
      console.log('停止するプロセスがありません');
      return true;
    }
    
    console.log('既存のバックエンドサーバーを終了します...');
    
    try {
      // 1. APIシャットダウンエンドポイントを呼び出し
      try {
        await axios.post(`http://127.0.0.1:${port}/api/shutdown`, {
          timeout: 3000
        });
        console.log('シャットダウンリクエストを送信しました');
      } catch (e) {
        console.warn('APIシャットダウン呼び出しに失敗:', e.message);
      }
      
      // 2. プロセスのグレースフル終了を最大で5秒待機
      let processExited = false;
      for (let i = 0; i < 5; i++) {
        if (!this.currentProcess || this.currentProcess.killed) {
          processExited = true;
          break;
        }
        
        try {
          // プロセスが存在するか確認
          process.kill(this.currentProcess.pid, 0);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          // プロセスがもう存在しない
          processExited = true;
          break;
        }
      }
      
      // 3. 5秒後もプロセスが生きていれば、SIGTERMを送信
      if (!processExited) {
        try {
          this.currentProcess.kill('SIGTERM');
          console.log('SIGTERMシグナルを送信しました');
          
          // SIGTERM後さらに3秒待機
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
          console.warn('SIGTERM送信エラー:', e.message);
        }
      }
      
      // 4. それでも終了しなければSIGKILL
      try {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill('SIGKILL');
          console.log('SIGKILLシグナルを送信しました');
        }
      } catch (e) {
        console.warn('SIGKILL送信エラー:', e.message);
      }
      
      this.currentProcess = null;
      return true;
    } catch (error) {
      console.error('プロセス終了エラー:', error);
      return false;
    }
  }
  
  /**
   * 既存のプロセスをクリーンアップします
   * @returns {Promise<Array<number>>} - 終了したプロセスIDの配列
   */
  async cleanupExistingProcesses() {
    if (this.isCleanupInProgress) {
      console.log('クリーンアップは既に進行中です');
      return [];
    }
    
    this.isCleanupInProgress = true;
    console.log('既存のPythonプロセスをクリーンアップしています...');
    
    try {
      // トラッキングファイルからPIDを取得
      let activePids = [];
      
      try {
        if (fs.existsSync(this.pidFilePath)) {
          const pidData = fs.readFileSync(this.pidFilePath, 'utf-8').trim();
          activePids = pidData.split(',').map(pid => parseInt(pid)).filter(pid => !isNaN(pid));
          console.log(`トラッキングファイルから ${activePids.length} 個のPIDを検出しました`);
        }
      } catch (err) {
        console.warn('PIDトラッキングファイルの読み込みに失敗:', err.message);
      }
      
      // findProcessによるポート占有プロセスの検出
      const ports = [8000, 8080, 8888, 8081, 8001, 3001, 5000];
      for (const port of ports) {
        try {
          const processes = await findProcess('port', port);
          for (const proc of processes) {
            if (proc.name && proc.name.toLowerCase().includes('python') && proc.pid) {
              if (!activePids.includes(proc.pid)) {
                activePids.push(proc.pid);
              }
            }
          }
        } catch (err) {
          console.warn(`ポート ${port} のプロセス検索エラー:`, err.message);
        }
      }
      
      // 検出したプロセスを段階的に終了
      let killedPids = [];
      if (activePids.length > 0) {
        console.log(`${activePids.length} 個のプロセスの終了を試みます...`);
        
        // まずSIGTERMで丁寧に終了要求
        for (const pid of activePids) {
          try {
            process.kill(pid, 'SIGTERM');
            console.log(`プロセス ${pid} にSIGTERMを送信しました`);
          } catch (err) {
            // すでに終了していれば無視
            if (err.code !== 'ESRCH') {
              console.warn(`プロセス ${pid} へのSIGTERM送信エラー:`, err.message);
            }
          }
        }
        
        // 2秒待ってSIGKILLで強制終了（必要な場合）
        await new Promise(resolve => setTimeout(resolve, 2000));
        for (const pid of activePids) {
          try {
            // 存在確認
            process.kill(pid, 0);
            
            // まだ存在する場合は強制終了
            try {
              process.kill(pid, 'SIGKILL');
              console.log(`プロセス ${pid} にSIGKILLを送信しました`);
              killedPids.push(pid);
            } catch (e) {
              // エラー無視
            }
          } catch (e) {
            // エラーが発生 = プロセスは既に終了
            killedPids.push(pid);
          }
        }
        
        console.log(`${killedPids.length}/${activePids.length} 個のプロセスを終了しました`);
      } else {
        console.log('クリーンアップするプロセスは見つかりませんでした');
      }
      
      // PIDトラッキングファイルをクリア
      try {
        fs.writeFileSync(this.pidFilePath, '');
      } catch (err) {
        console.warn('PIDトラッキングファイルの初期化に失敗:', err.message);
      }
      
      return killedPids;
    } finally {
      this.isCleanupInProgress = false;
    }
  }
}

module.exports = ProcessManager;