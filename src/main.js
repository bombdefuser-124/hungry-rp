import { getChats, getSettings } from './db.js';
import { bindShellEvents } from './events.js';
import { createChat, persistActiveChat } from './chat-model.js';
import { escapeHtml } from './reasoning.js';
import { state } from './state.js';
import { render, renderShell } from './ui.js';

async function init() {
  state.settings = await getSettings();
  state.chats = await getChats();

  if (!state.chats.length) {
    state.activeChat = createChat('session-001');
    await persistActiveChat();
  } else {
    state.activeChat = state.chats[0];
  }

  renderShell();
  bindShellEvents();
  render();
}

init().catch(error => {
  document.getElementById('appShell').innerHTML = `<div class="empty-state"><strong>Startup error</strong>${escapeHtml(error.message || String(error))}</div>`;
});
