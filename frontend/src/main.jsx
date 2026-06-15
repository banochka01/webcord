import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const isNativeClient = Boolean(
  window.__TAURI__?.window ||
  window.__TAURI_INTERNALS__ ||
  window.Capacitor?.isNativePlatform?.() ||
  window.webcordDesktop ||
  window.webcordWindow ||
  window.electronAPI ||
  /\b(WebCordAndroid|WebCordTauri|WebCordDesktop|Electron)\b/i.test(navigator.userAgent)
);

if (isNativeClient) {
  document.documentElement.classList.add('native-client');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations?.()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});

    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('webcord-')).map((key) => caches.delete(key))))
        .catch(() => {});
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
