import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/system.css';
import './styles/scroll.css';
import './styles/landing.css';
import './styles/workspace.css';
import './styles/sheets.css';
import './styles/briefing.css';
import './styles/calendar.css';
import './styles/sequence.css';
import './styles/landing-parts.css';
import './styles/film.css';
import { setControlSound } from './identity/controlState';
import { armControlVoices, controlVoice } from './ui/controlVoices';

if (new URLSearchParams(window.location.search).has('film')) document.documentElement.classList.add('iso-film');
// The landing's fire is not in yet (App says when it is): the film keeps the page dark with only the mark until then.
document.documentElement.setAttribute('data-fire', 'loading');
// The identity's controls speak in two voices while sound is on.
setControlSound(controlVoice);
armControlVoices();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
