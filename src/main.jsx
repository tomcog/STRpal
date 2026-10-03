import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// index.css first: it declares the cascade layer order, and a layer's position
// is fixed the first time its name is seen. Then the library's stylesheet,
// which is not auto-injected.
import './styles/index.css';
import '@tomcoggia/ui/styles.css';
import { AppProvider } from './app/AppContext.jsx';
import App from './app/App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// iOS Safari ignores user-scalable=no; block pinch and double-tap zoom.
// A zoomable view (image viewer, map) must opt out locally - don't unhook these.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// A file dropped just outside a picker would otherwise open in the tab
document.addEventListener('dragover', (e) => {
  if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
});

registerSW({ immediate: true });
