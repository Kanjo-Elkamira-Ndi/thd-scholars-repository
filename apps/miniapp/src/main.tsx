import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@/lib/query-client';
import { initTelegram } from '@/lib/telegram';
import { router } from '@/router';
import '@/index.css';

initTelegram();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
