import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Safe mounting function to retry if root is missing momentarily
const mount = () => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
        console.warn("Root element not found, retrying in 50ms...");
        setTimeout(mount, 50);
        return;
    }
    
    try {
        const root = ReactDOM.createRoot(rootElement);
        root.render(
          <React.StrictMode>
            <App />
          </React.StrictMode>
        );
    } catch (e) {
        console.error("React Mounting Error:", e);
        rootElement.innerHTML = `<div style="color:red;padding:20px;">React Error: ${e.message}</div>`;
    }
};

// Ensure DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
} else {
    mount();
}
