import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './theme-systems.css';
import './quality-4-1.css';

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
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
