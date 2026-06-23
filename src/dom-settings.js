import { state } from './state.js';

export function applySettings() {
  if (!state.settings) return;
  const appShell = document.getElementById('appShell');
  document.documentElement.style.setProperty('--dialogue-color', state.settings.dialogueColor);
  document.documentElement.style.setProperty('--action-color', state.settings.actionColor);
  appShell.classList.toggle('always-show-actions', Boolean(state.settings.alwaysShowActions));
  appShell.classList.toggle('hide-images', !state.settings.showImages);
  appShell.classList.toggle('compact-cards', Boolean(state.settings.compactCards));
}
