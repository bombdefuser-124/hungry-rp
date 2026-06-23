import { fetchBackendConfig, DEFAULT_PROXY_URL } from './api.js';
import { getChats, getSettings, getStoreItems, saveSettings } from './db.js';
import { bindShellEvents } from './events.js';
import { createChat, persistActiveChat } from './chat-model.js';
import { escapeHtml } from './reasoning.js';
import { activeCharacter, state } from './state.js';
import { render, renderShell } from './ui.js';

async function init() {
  state.settings = await getSettings();

  try {
    const config = await fetchBackendConfig(DEFAULT_PROXY_URL);
    state.settings = await saveSettings({
      ...state.settings,
      proxyUrl: config.proxyUrl || DEFAULT_PROXY_URL,
      baseUrl: config.provider?.baseUrl || state.settings.baseUrl,
      apiKey: config.provider?.apiKey ?? state.settings.apiKey,
      model: state.settings.model || config.provider?.model || ''
    });
  } catch {
    state.settings = await saveSettings({ ...state.settings, proxyUrl: DEFAULT_PROXY_URL });
  }

  state.chats = await getChats();
  state.characters = await getStoreItems('characters');
  state.personas = await getStoreItems('personas');
  state.presets = await getStoreItems('presets');

  if (!state.settings.activeCharacterId && state.characters[0]) {
    state.settings = await saveSettings({ ...state.settings, activeCharacterId: state.characters[0].id });
  }
  if (!state.settings.activePersonaId && state.personas[0]) {
    state.settings = await saveSettings({ ...state.settings, activePersonaId: state.personas[0].id });
  }
  if (!state.settings.activePresetId && state.presets[0]) {
    state.settings = await saveSettings({ ...state.settings, activePresetId: state.presets[0].id });
  }

  if (!state.chats.length) {
    state.activeChat = createChat('session-001', activeCharacter());
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
