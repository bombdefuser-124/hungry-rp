import { state } from './state.js';

export function setStatus(message) {
  state.status = message || '';
  const line = document.getElementById('statusLine');
  if (line) line.textContent = state.status;
}
