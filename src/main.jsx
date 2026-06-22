import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './contexts/AuthContext';
import { StoreProvider } from './contexts/StoreContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <StoreProvider>
                <App />
            </StoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
    // <React.StrictMode>
  // </React.StrictMode>
);
