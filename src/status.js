import { state } from './state.js';

let statusTimer = null;

export function setStatus(message) {
  state.status = message || '';
  syncStatus();
  window.clearTimeout(statusTimer);
  if (!state.status) return;
  statusTimer = window.setTimeout(() => {
    state.status = '';
    syncStatus();
  }, 3000);
}

export function syncStatus() {
  const line = document.getElementById('statusLine');
  if (line) line.textContent = state.status;
}
