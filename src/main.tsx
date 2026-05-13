import React from 'react';
import { createRoot } from 'react-dom/client';
// eslint-disable-next-line import/no-unresolved
import './styles/global.css';
import { App } from './App';

// ─── Mount React root ──────────────────────
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}