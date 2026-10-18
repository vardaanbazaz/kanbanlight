import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { RecoveryBoundary } from './components/RecoveryScreen';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecoveryBoundary>
      <App />
    </RecoveryBoundary>
  </StrictMode>
);
