import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const isNativeClient = Boolean(
  window.Capacitor?.isNativePlatform?.() ||
  window.webcordDesktop ||
  window.webcordWindow ||
  window.electronAPI ||
  /\b(WebCordAndroid|WebCordDesktop|Electron)\b/i.test(navigator.userAgent)
);

if (isNativeClient) {
  document.documentElement.classList.add('native-client');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
