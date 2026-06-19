import React, { Suspense } from 'react';
import { Loading } from './Loading';

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function LazyLoader({ children, fallback }: LazyLoaderProps) {
  return (
    <Suspense
      fallback={
        fallback || (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Loading type="spinner" size="medium" text="加载中..." />
          </div>
        )
      }
    >
      {children}
    </Suspense>
  );
}