import React, { Suspense } from 'react';
import { Loading } from './Loading';

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function LazyLoader({ children, fallback }: LazyLoaderProps): React.JSX.Element {
  return (
    <Suspense
      fallback={
        fallback || (
          <div className="lazy-loading">
            <Loading type="spinner" size="medium" text="加载中..." />
          </div>
        )
      }
    >
      {children}
    </Suspense>
  );
}