import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Two-Tier Google Maps Demo Key Quota Detection (Case A)
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  if (
    args.some(
      (a) =>
        typeof a === 'string' &&
        (a.includes('OverQuotaMapError') || a.includes('QuotaExceededError')),
    )
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  origError.apply(console, args);
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
