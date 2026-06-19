import { describe, it, expect } from 'vitest';
import React, { Suspense, lazy } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const LazyTestComponent = lazy(() => Promise.resolve({ 
  default: () => <div>Loaded!</div> 
}));

describe('Lazy Loading Test', () => {
  it('should lazy load component', async () => {
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <LazyTestComponent />
      </Suspense>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Loaded!')).toBeInTheDocument();
    });
  });
});