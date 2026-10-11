import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Matches Jolpica's CDN cache (max-age=600): polling faster would only re-read the same cached response.
      staleTime: 5 * 60 * 1000,
      refetchInterval: 10 * 60 * 1000, // only while the tab is visible (TanStack default)
      gcTime: 60 * 60 * 1000,
      refetchOnWindowFocus: true, // respects staleTime, so tab-switching can't burn the quota
      // A shape error won't fix itself; retrying it would only burn the hourly quota.
      retry: (count, error) => !(error instanceof ZodError) && count < 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
