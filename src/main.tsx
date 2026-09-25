import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './theme/theme.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { claimTabIdentity } from './shared/tab/duplicate-guard';

async function boot() {
  // Must finish before the app module loads: the session stores hydrate from
  // sessionStorage on import, and a duplicated tab has to clear that copy first.
  await claimTabIdentity();
  const { App } = await import('./app/App');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
