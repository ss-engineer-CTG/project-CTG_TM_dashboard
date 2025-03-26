import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorBoundaryProps } from '../types';

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * エラーバウンダリコンポーネント
 * Reactのレンダリング中のエラーをキャッチして、フォールバックUIを表示します
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // エラー発生時にhasErrorをtrueに設定して次のレンダリングでフォールバックUIを表示
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // エラー情報をログに記録
    console.error('エラーバウンダリでエラーをキャッチしました:', error);
    console.error('コンポーネントスタック:', errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // カスタムフォールバックUIがある場合はそれを表示
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // デフォルトのフォールバックUI
      return (
        <div className="p-4 bg-red-900 bg-opacity-20 rounded">
          <h3 className="text-red-400 font-medium mb-2">エラーが発生しました</h3>
          <div className="text-white mb-4">
            <p>アプリケーションで予期しないエラーが発生しました。</p>
            {this.state.error && (
              <div className="mt-2 p-2 bg-gray-800 rounded text-sm">
                <p>{this.state.error.message}</p>
              </div>
            )}
          </div>
          <button
            onClick={this.handleReset}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
          >
            再試行
          </button>
        </div>
      );
    }

    // エラーがない場合は子コンポーネントを通常通り表示
    return this.props.children;
  }
}

export default ErrorBoundary;