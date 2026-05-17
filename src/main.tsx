import React from 'react';
import { createRoot } from 'react-dom/client';
// eslint-disable-next-line import/no-unresolved
import './styles/global.css';
import { App } from './App';

// ─── Patch Vite-externalized Node builtins at import time ──────────────
// Vite sets externalized modules to undefined in the bundle. This inline script
// (injected via index.html before the main bundle) patches them on the prototype
// so ioredis and other packages can extend EventEmitter, Buffer, etc.

// Inject polyfill globals BEFORE any module tries to use them — this runs as a <script> 
// in index.html that patches globalThis.EventEmitter = require('events').EventEmitter etc.
declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/no-explicit-any
  var EventEmitter: any;
}

const _VITE_EXTERNALS = ['events', 'stream', 'buffer'];

if (_VITE_EXTERNALS.includes('events') && typeof globalThis.EventEmitter === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ee = require('events');
  (globalThis as any).EventEmitter = ee.EventEmitter || ee;
}

// ─── Mount React root ──────────────────────
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}