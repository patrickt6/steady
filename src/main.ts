import './style.css';
import { mountApp } from './ui/app';

const base = import.meta.env.BASE_URL;

mountApp(`${base}noise-processor.js`);

// Offline support. Registered after load so it never competes with the first
// paint or with starting audio.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      // No offline cache this time. Everything else still works.
    });
  });
}
