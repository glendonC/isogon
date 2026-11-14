import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/system.css';
import './styles/landing.css';
import './styles/workspace.css';
import './styles/sheets.css';
import './styles/briefing.css';
import './styles/calendar.css';
import './styles/sequence.css';
import './styles/landing-parts.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
