const builder = require('electron-builder');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Python仮想環境のセットアップ
async function setupPythonEnv() {
  console.log('Setting up Python virtual environment...');
  
  const pythonPath = path.join(__dirname, '..', 'python');
  
  // Windows環境とその他の環境でコマンドを分ける
  const isWin = process.platform === 'win32';
  const pythonCmd = isWin ? 'python' : 'python3';
  const pipCmd = 'pip';
  
  try {
    // 仮想環境の作成（存在しない場合）
    const venvPath = path.join(pythonPath, 'venv');
    if (!fs.existsSync(venvPath)) {
      console.log('Creating virtual environment...');
      execSync(`${pythonCmd} -m venv venv`, { cwd: pythonPath });
    }
    
    // 依存関係のインストール
    console.log('Installing Python dependencies...');
    const venvPipCmd = isWin
      ? path.join(venvPath, 'Scripts', 'pip')
      : path.join(venvPath, 'bin', 'pip');
    
    execSync(`${venvPipCmd} install -r requirements.txt`, { cwd: pythonPath });
    console.log('Python setup completed successfully');
    
    return true;
  } catch (error) {
    console.error('Error setting up Python environment:', error);
    return false;
  }
}

// メインビルド処理
async function buildApp() {
  try {
    // Python環境のセットアップ
    const pythonSetupSuccess = await setupPythonEnv();
    if (!pythonSetupSuccess) {
      console.error('Failed to set up Python environment. Aborting build.');
      process.exit(1);
    }
    
    // Electronアプリのビルド
    console.log('Building Electron application...');
    
    // ビルド設定
    const buildConfig = {
      appId: 'com.yourdomain.projectdashboard',
      productName: 'Project Dashboard',
      directories: {
        output: 'dist'
      },
      files: [
        '**/*',
        '!python/venv/**/*', // 仮想環境は除外
        '!node_modules/**/*',
        '!dist/**/*',
        '!build/**/*'
      ],
      extraResources: [
        {
          from: 'python',
          to: 'python',
          filter: ['**/*', '!venv/**/*', '!**/__pycache__/**/*', '!**/*.pyc']
        }
      ],
      // Windowsビルド設定
      win: {
        target: 'nsis',
        icon: path.join(__dirname, 'icons', 'icon.ico')
      },
      // macOSビルド設定
      mac: {
        target: 'dmg',
        icon: path.join(__dirname, 'icons', 'icon.icns')
      },
      // Linuxビルド設定 
      linux: {
        target: 'AppImage',
        icon: path.join(__dirname, 'icons', 'icon.png')
      },
      // インストーラー設定
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        runAfterFinish: true,
        installerIcon: path.join(__dirname, 'icons', 'icon.ico'),
        uninstallerIcon: path.join(__dirname, 'icons', 'icon.ico')
      }
    };
    
    // ビルド実行
    await builder.build({
      config: buildConfig
    });
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// ビルド実行
buildApp();