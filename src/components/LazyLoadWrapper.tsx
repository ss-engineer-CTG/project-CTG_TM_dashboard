import React, { Suspense, PropsWithChildren, ComponentType } from 'react';

// コンポーネント共通のローディングインジケータ
const DefaultFallback = () => (
  <div className="p-4 flex items-center justify-center">
    <div className="animate-pulse text-text-secondary">ロード中...</div>
  </div>
);

interface LazyLoadWrapperProps {
  fallback?: React.ReactNode;
}

/**
 * 共通の遅延ロードラッパーコンポーネント
 * Suspenseの共通実装を提供する
 */
export const LazyLoadWrapper: React.FC<PropsWithChildren<LazyLoadWrapperProps>> = ({ 
  children, 
  fallback = <DefaultFallback /> 
}) => {
  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  );
};

/**
 * コンポーネントを遅延ロード対応にする高階コンポーネント
 */
export function withLazyLoading<P extends object>(
  Component: ComponentType<P>,
  fallback?: React.ReactNode
) {
  const LazyComponent: React.FC<P> = (props) => (
    <LazyLoadWrapper fallback={fallback}>
      <Component {...props} />
    </LazyLoadWrapper>
  );
  
  // 表示名を設定
  const displayName = Component.displayName || Component.name || 'Component';
  LazyComponent.displayName = `Lazy${displayName}`;
  
  return LazyComponent;
}