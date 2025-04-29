/**
 * バックエンド接続状態を管理するクラス
 * Electronアプリケーションと FastAPIバックエンド間の接続を段階的に管理します
 */
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');

class BackendConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.state = 'initializing'; // 'initializing' -> 'starting' -> 'ready' -> 'error'
    this.readyPromise = null;
    this.retryCount = 0;
    this.maxRetries = 10;
    this.backoffFactor = 1.5; // 指数バックオフのファクター
    this.port = null;
    this.connectionTimeout = 60000; // 60秒のタイムアウト
    this.readinessProgress = 0;
    this.components = {};
    
    // 状態変更時のログ出力
    this.on('stateChange', (newState, oldState) => {
      console.log(`バックエンド接続状態: ${oldState} -> ${newState}`);
    });
  }
  
  /**
   * バックエンドの準備が完了するまで待機します
   * @param {number} port - 使用するポート番号
   * @returns {Promise<boolean>} - 準備完了ならtrue、失敗ならfalse
   */
  async waitForReadiness(port) {
    this.port = port;
    
    if (this.state === 'ready') return true;
    
    if (!this.readyPromise) {
      this.setState('starting');
      
      this.readyPromise = new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          this.setState('error');
          console.error(`バックエンド接続タイムアウト (${this.connectionTimeout}ms)`);
          resolve(false);
        }, this.connectionTimeout);
        
        this.startReadinessCheck(resolve, timeoutId);
      });
    }
    
    return this.readyPromise;
  }
  
  /**
   * ステートを設定し、変更イベントを発行します
   * @param {string} newState - 新しい状態
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', newState, oldState);
  }
  
  /**
   * 準備状態の確認を開始します
   * @param {Function} resolvePromise - プロミスを解決する関数
   * @param {NodeJS.Timeout} timeoutId - タイムアウトID
   */
  startReadinessCheck(resolvePromise, timeoutId) {
    // 段階的なヘルスチェックの実装
    const checkHealth = async () => {
      try {
        // 特殊な「本当に準備完了か」エンドポイントをチェック
        const response = await axios.get(
          `http://127.0.0.1:${this.port}/api/system/readiness`,
          { 
            timeout: 2000 + (this.retryCount * 500), // 徐々に長いタイムアウト
            headers: { 'Accept': 'application/json' }
          }
        );
        
        // 進捗情報を更新
        this.readinessProgress = response.data.progress || 0;
        this.components = response.data.components || {};
        
        // 完全に準備完了
        if (response.status === 200 && response.data.readiness === 'complete') {
          this.setState('ready');
          clearTimeout(timeoutId);
          console.log('バックエンドサーバーが完全に初期化されました');
          
          // 接続成功情報をファイルに保存
          this.saveSuccessfulConnection();
          
          resolvePromise(true);
          return;
        }
        
        // 部分的に準備ができている場合
        if (response.status === 200 && 
            (response.data.readiness === 'partial' || response.data.readiness === 'initializing')) {
          console.log(`バックエンド初期化中: ${response.data.progress}% 完了`);
          this.emit('progress', response.data.progress, response.data.components);
          this.scheduleNextCheck(checkHealth);
          return;
        }
        
        // エラー状態
        if (response.status === 200 && response.data.readiness === 'error') {
          this.setState('error');
          clearTimeout(timeoutId);
          console.error('バックエンドサーバーの初期化に失敗しました');
          resolvePromise(false);
          return;
        }
        
        // 想定外のレスポンス
        this.retryCount++;
        console.warn(`想定外のレスポンス: ${JSON.stringify(response.data)}`);
        this.scheduleNextCheck(checkHealth);
        
      } catch (e) {
        // エラー処理 - 指数バックオフで再試行
        this.retryCount++;
        
        if (this.retryCount > this.maxRetries) {
          this.setState('error');
          clearTimeout(timeoutId);
          console.error('バックエンド準備確認の最大試行回数を超えました');
          resolvePromise(false);
          return;
        }
        
        console.log(`バックエンド接続確認を再試行します (${this.retryCount}/${this.maxRetries})`);
        this.scheduleNextCheck(checkHealth);
      }
    };
    
    // 初回チェックを開始
    checkHealth();
  }
  
  /**
   * 次回のチェックをスケジュールします (指数バックオフ戦略)
   * @param {Function} checkFn - 実行する関数
   */
  scheduleNextCheck(checkFn) {
    // 指数バックオフ戦略を実装
    const delay = Math.min(
      1000 * Math.pow(this.backoffFactor, this.retryCount - 1),
      10000 // 最大10秒まで
    );
    
    setTimeout(checkFn, delay);
  }
  
  /**
   * 成功した接続情報を一時ファイルに保存します
   */
  saveSuccessfulConnection() {
    try {
      // 接続情報を保存する一時ファイルのパス
      const connectionFilePath = path.join(os.tmpdir(), 'project_dashboard_connection.json');
      
      // 保存する接続情報
      const connectionInfo = {
        port: this.port,
        timestamp: Date.now(),
        components: this.components
      };
      
      // ファイルに書き込み
      fs.writeFileSync(connectionFilePath, JSON.stringify(connectionInfo, null, 2));
      console.log(`接続情報をファイルに保存しました: ${connectionFilePath}`);
    } catch (err) {
      console.warn('接続情報の保存に失敗:', err.message);
    }
  }
  
  /**
   * リセットして初期状態に戻します
   */
  reset() {
    this.state = 'initializing';
    this.readyPromise = null;
    this.retryCount = 0;
    this.readinessProgress = 0;
    this.components = {};
    this.emit('reset');
  }
  
  /**
   * 現在の進捗状況を取得します
   */
  getProgress() {
    return {
      state: this.state,
      progress: this.readinessProgress,
      components: this.components,
      retryCount: this.retryCount
    };
  }
}

module.exports = BackendConnectionManager;