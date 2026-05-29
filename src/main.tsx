import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// When a Vite modulepreload link 404s after a deploy, reload once to get fresh index.html.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('chunkReload')) {
    sessionStorage.setItem('chunkReload', '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
