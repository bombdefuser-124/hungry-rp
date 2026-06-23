import { fetchModels } from './api.js';
import { saveSettings } from './db.js';
import { applySettings } from './dom-settings.js';
import { isContextSlotPrompt, isDefaultPresetPrompt } from './content-parsers.js';
import { icons } from './icons.js';
import { escapeHtml } from './reasoning.js';
import { activeCharacter, activePersona, activePreset, state } from './state.js';
import { setStatus } from './status.js';

export function renderPanel() {
  const panelTitle = document.getElementById('panelTitle');
  const panelSubtitle = document.getElementById('panelSubtitle');
  const panelActions = document.getElementById('panelActions');
  const panelBody = document.getElementById('panelBody');
  if (!panelTitle || !panelSubtitle || !panelActions || !panelBody) return;

  document.querySelectorAll('.rail-button[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.activeView));

  const views = {
    connections: renderConnections,
    presets: renderPresets,
    characters: renderCharacters,
    personas: renderPersonas,
    settings: renderSettings
  };

  views[state.activeView]?.(panelTitle, panelSubtitle, panelActions, panelBody);
}

function renderConnections(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Connections';
  panelSubtitle.textContent = 'backend proxy and provider';
  panelActions.innerHTML = '';
  panelBody.innerHTML = `
    <div class="panel-section">
      <div class="section-title">|- Local proxy</div>
      <div class="config-readout"><span>Proxy URL</span><strong>${escapeHtml(state.settings.proxyUrl)}</strong></div>
      <div class="panel-note">The proxy URL is loaded from root <code>config.yaml</code>. The browser no longer edits this value.</div>
    </div>
    <div class="panel-section">
      <div class="section-title">|- OAI compatible</div>
      ${panelField('Base URL', 'settingBaseUrl', state.settings.baseUrl)}
      ${panelField('API key', 'settingApiKey', state.settings.apiKey, 'password')}
      <button class="connect-button" id="connectModelsButton" type="button">Connect and fetch models</button>
      <div class="connection-result" id="connectionResult"></div>
      <div class="field"><label>Model</label><select id="settingModel">${modelOptions()}</select></div>
    </div>
    <div class="panel-section">
      <div class="section-title">|- Sampling</div>
      <div class="two-col">${panelField('Temperature', 'settingTemperature', state.settings.temperature, 'number')}${panelField('Top P', 'settingTopP', state.settings.topP, 'number')}</div>
      <div class="two-col">${panelField('Max context', 'settingMaxContext', state.settings.maxContext, 'number')}${panelField('Max output', 'settingMaxOutput', state.settings.maxOutput, 'number')}</div>
    </div>`;
  bindConnectionPanel();
}

function renderPresets(panelTitle, panelSubtitle, panelActions, panelBody) {
  const preset = activePreset();
  panelTitle.textContent = 'Presets';
  panelSubtitle.textContent = preset ? `${preset.prompts?.length || 0} context controls` : 'SillyTavern-compatible context control';
  panelActions.innerHTML = `<button class="panel-action-button" data-panel-action="create-empty-preset" title="Create empty preset">${icons.add}</button><button class="panel-action-button" data-panel-action="import-preset" title="Import preset">${icons.import}</button><button class="panel-action-button" data-panel-action="export-preset" title="Export preset">${icons.export}</button>${preset ? `<button class="panel-action-button danger" data-panel-action="delete-preset" data-id="${preset.id}" title="Delete preset">${icons.delete}</button>` : ''}`;

  if (!state.presets.length) {
    panelBody.innerHTML = `
      <div class="empty-panel">
        <strong>No presets yet</strong>
        <span>Import a SillyTavern preset, or create a preset with the default context slots already pinned at the bottom.</span>
        <div class="inline-button-row"><button class="small-action" data-panel-action="create-empty-preset">Create empty preset</button><button class="small-action" data-panel-action="import-preset">Import preset JSON</button></div>
      </div>`;
    return;
  }

  panelBody.innerHTML = `
    <div class="panel-section">
      <div class="section-title">|- Active preset</div>
      <select id="activePresetSelect" class="full-select">
        ${state.presets.map(item => `<option value="${item.id}" ${item.id === preset?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
      </select>
      <button class="small-action full-action" data-panel-action="add-preset-prompt">Add prompt block</button>
    </div>
    ${(preset?.prompts || []).map((prompt, index) => renderPromptBlock(prompt, index)).join('') || '<div class="empty-panel"><strong>Empty preset</strong><span>Add prompt blocks, choose their roles, and write their text. Changes save automatically.</span></div>'}`;

  document.getElementById('activePresetSelect')?.addEventListener('change', event => document.dispatchEvent(new CustomEvent('panel-action', { detail: { action: 'select-preset', id: event.target.value } })));
  document.querySelectorAll('.prompt-role-select').forEach(select => {
    select.addEventListener('change', event => document.dispatchEvent(new CustomEvent('panel-action', { detail: { action: 'update-prompt-role', id: select.dataset.id, role: event.target.value } })));
  });
  document.querySelectorAll('.prompt-content-input').forEach(input => {
    let timer = null;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.dispatchEvent(new CustomEvent('panel-action', { detail: { action: 'update-prompt-content', id: input.dataset.id, content: input.value } })), 250);
    });
  });
}

function renderPromptBlock(prompt, index) {
  const meta = prompt.meta || {};
  const contextSlot = isContextSlotPrompt(prompt);
  const defaultPrompt = isDefaultPresetPrompt(prompt);
  const details = [
    defaultPrompt ? 'default' : 'custom',
    contextSlot ? 'context slot' : 'editable prompt',
    meta.category,
    meta.badge
  ].filter(Boolean).join(' // ');
  const expanded = Boolean(prompt.expanded);
  const roleControl = contextSlot
    ? `<span class="prompt-role-static">${escapeHtml(prompt.role || 'system')}</span>`
    : `<select class="prompt-role-select" data-id="${prompt.id}" title="Prompt role">${['system', 'user', 'assistant'].map(role => `<option value="${role}" ${role === (prompt.role || 'system') ? 'selected' : ''}>${role}</option>`).join('')}</select>`;
  const expandedBody = contextSlot
    ? `<div class="prompt-block-body"><div class="context-slot-note">${escapeHtml(contextSlotText(prompt))}</div></div>`
    : `<div class="prompt-block-body"><textarea class="prompt-content-input" data-id="${prompt.id}" placeholder="Write this prompt block...">${escapeHtml(prompt.content || '')}</textarea></div>`;

  return `
    <div class="prompt-block ${prompt.enabled === false ? 'disabled' : ''} ${expanded ? 'expanded' : 'collapsed'} ${defaultPrompt ? 'default-prompt' : ''}">
      <div class="prompt-block-head">
        <input class="toggle" type="checkbox" ${prompt.enabled !== false ? 'checked' : ''} data-panel-action="toggle-prompt" data-id="${prompt.id}" title="Enable prompt" />
        <div class="prompt-block-main">
          <div class="prompt-block-name">${String(index + 1).padStart(2, '0')} // ${escapeHtml(prompt.name)}</div>
          <div class="prompt-block-meta">${escapeHtml(details)}</div>
        </div>
        <div class="prompt-block-actions">
          ${roleControl}
          <button class="edit-block-button" data-panel-action="toggle-prompt-expanded" data-id="${prompt.id}" title="${expanded ? 'Hide details' : 'Show details'}">${expanded ? 'hide' : 'show'}</button>
        </div>
      </div>
      ${expanded ? expandedBody : ''}
    </div>`;
}

function contextSlotText(prompt) {
  const character = activeCharacter();
  const persona = activePersona();
  const map = {
    worldInfoBefore: 'Reserved slot for lore/world info before character context. World info is not implemented yet.',
    personaDescription: persona ? `Filled from active persona: ${persona.description || persona.name}` : 'Filled from the active persona description when one is selected.',
    charDescription: character ? `Filled from active character description: ${character.description || 'empty'}` : 'Filled from the active character description.',
    charPersonality: character ? `Filled from active character personality: ${character.personality || 'empty'}` : 'Filled from the active character personality.',
    scenario: character ? `Filled from active character scenario: ${character.scenario || 'empty'}` : 'Filled from the active character scenario.',
    worldInfoAfter: 'Reserved slot for lore/world info after character context. World info is not implemented yet.',
    dialogueExamples: character ? `Filled from active character example dialogue: ${character.messageExample || 'empty'}` : 'Filled from the active character example dialogue.',
    chatHistory: 'Insertion point for the visible chat history. If disabled, chat history is appended after enabled preset prompts.'
  };
  return map[prompt.identifier] || 'Default context slot. It can be enabled or disabled, but its content is filled by the app.';
}

function renderCharacters(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Characters';
  panelSubtitle.textContent = 'CCv3 JSON and PNG cards';
  panelActions.innerHTML = `<button class="panel-action-button" data-panel-action="import-character" title="Import character">${icons.import}</button><button class="panel-action-button" data-panel-action="show-character-create" title="Create character">${icons.add}</button>${activeCharacter() ? `<button class="panel-action-button" data-panel-action="export-character" title="Export character">${icons.export}</button>` : ''}`;

  if (state.panelMode === 'create-character') {
    panelBody.innerHTML = characterForm();
    return;
  }

  if (state.panelMode?.startsWith('edit-character:')) {
    const character = state.characters.find(item => item.id === state.panelMode.slice('edit-character:'.length));
    panelBody.innerHTML = character ? characterForm(character) : '<div class="empty-panel"><strong>Character not found</strong><span>Select another character and try again.</span></div>';
    return;
  }

  panelBody.innerHTML = `
    ${!state.characters.length ? `<div class="empty-panel"><strong>No characters yet</strong><span>Import a card or create a simple character to begin.</span></div>` : ''}
    ${state.characters.map(character => renderCharacterItem(character)).join('')}`;
}

function renderCharacterItem(character) {
  const active = character.id === state.settings.activeCharacterId;
  return `
    <div class="list-item rich ${active ? 'active' : ''}" data-panel-action="select-character" data-id="${character.id}">
      <div class="image-thumb">${character.image ? `<img src="${character.image}" alt="" />` : ''}</div>
      <div class="item-main"><div class="item-name">${escapeHtml(character.name)}</div><div class="item-desc">${escapeHtml(character.scenario || character.description || character.sourceName || 'character card')}</div></div>
      <div class="item-actions">
        <button class="branch-icon-button" data-panel-action="edit-character" data-id="${character.id}" title="Edit">${icons.edit}</button>
        <button class="branch-icon-button" data-panel-action="export-character" data-id="${character.id}" title="Export">${icons.export}</button>
        <button class="branch-icon-button danger" data-panel-action="delete-character" data-id="${character.id}" title="Delete">${icons.delete}</button>
      </div>
    </div>`;
}

function renderPersonas(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Personas';
  panelSubtitle.textContent = 'user identities';
  panelActions.innerHTML = `<button class="panel-action-button" data-panel-action="show-persona-create" title="Create persona">${icons.add}</button>`;

  if (state.panelMode === 'create-persona') {
    panelBody.innerHTML = personaForm();
    return;
  }

  panelBody.innerHTML = `
    ${!state.personas.length ? `<div class="empty-panel"><strong>No personas yet</strong><span>Create a lightweight persona with a text description and optional image.</span></div>` : ''}
    ${state.personas.map(persona => renderPersonaItem(persona)).join('')}`;
}

function renderPersonaItem(persona) {
  const active = persona.id === state.settings.activePersonaId;
  return `
    <div class="list-item rich ${active ? 'active' : ''}" data-panel-action="select-persona" data-id="${persona.id}">
      <div class="image-thumb">${persona.image ? `<img src="${persona.image}" alt="" />` : ''}</div>
      <div class="item-main"><div class="item-name">${escapeHtml(persona.name)}</div><div class="item-desc">${escapeHtml(persona.description || 'persona')}</div></div>
      <div class="item-actions"><button class="branch-icon-button danger" data-panel-action="delete-persona" data-id="${persona.id}" title="Delete">${icons.delete}</button></div>
    </div>`;
}

function renderSettings(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Settings';
  panelSubtitle.textContent = 'interface and reasoning';
  panelActions.innerHTML = '';
  panelBody.innerHTML = `
    <div class="panel-section">
      <div class="section-title">|- Import</div>
      <button class="small-action full-action" data-panel-action="import-sillytavern">Import from SillyTavern</button>
      <div class="panel-note">Scans only SillyTavern userdata under the install path you provide, then lets you choose exact characters, personas, and presets before importing.</div>
    </div>
    <div class="panel-section">
      <div class="section-title">|- Interface</div>
      ${toggleLine('settingShowImages', 'Show character images', state.settings.showImages)}
      ${toggleLine('settingCompactCards', 'Compact message cards', state.settings.compactCards)}
      ${toggleLine('settingAlwaysShowActions', 'Always show action tab', state.settings.alwaysShowActions)}
    </div>
    <div class="panel-section">
      <div class="section-title">|- Reasoning</div>
      ${toggleLine('settingReasoningExpanded', 'Always expand reasoning', state.settings.reasoningAlwaysExpanded)}
      ${state.settings.reasoningAlwaysExpanded ? toggleLine('settingReasoningCollapseWhenClosed', 'Collapse when reasoning closes', state.settings.reasoningCollapseWhenClosed) : ''}
      ${panelField('Start tag', 'settingReasoningStart', state.settings.reasoningStartTag)}
      ${panelField('End tag', 'settingReasoningEnd', state.settings.reasoningEndTag)}
      <div class="panel-note">Default reasoning uses &lt;think&gt; and &lt;/think&gt;. If a stream only emits the end tag, everything before it is moved into a reasoning block and visible streaming continues.</div>
    </div>
    <div class="panel-section">
      <div class="section-title">|- Text colors</div>
      ${colorField('Dialogue in quotes', 'dialogueColor', state.settings.dialogueColor)}
      ${colorField('Action in asterisks', 'actionColor', state.settings.actionColor)}
    </div>`;
  bindSettingsPanel();
}

function characterForm(character = null) {
  const editing = Boolean(character);
  const imagePreview = character?.image ? `<div class="current-image-preview"><img src="${character.image}" alt="" /><span>Current image is used for chat icons. Upload a file below to replace it.</span></div>` : '<div class="panel-note">No image is attached yet. Upload one to use it as this character\'s chat icon.</div>';
  return `
    <div class="panel-section creation-card">
      <div class="section-title">|- ${editing ? 'Edit character' : 'Create character'}</div>
      ${panelField('Name', 'characterName', character?.name || '')}
      ${panelTextarea('Description', 'characterDescription', 'Appearance, premise, traits, and any card text.', character?.description || '')}
      ${panelTextarea('Personality', 'characterPersonality', 'Optional personality notes.', character?.personality || '')}
      ${panelTextarea('Scenario', 'characterScenario', 'Optional starting situation.', character?.scenario || '')}
      ${panelTextarea('First message', 'characterFirstMessage', 'Optional greeting used when starting a new chat.', character?.firstMessage || '')}
      ${panelTextarea('Example dialogue', 'characterExample', 'Optional examples.', character?.messageExample || '')}
      ${panelTextarea('System prompt', 'characterSystemPrompt', 'Optional character-specific system prompt.', character?.systemPrompt || '')}
      <div class="field"><label>${editing ? 'Replace image' : 'Optional image'}</label>${imagePreview}<input id="characterImage" type="file" accept="image/*" /></div>
      <div class="form-actions"><button class="small-action" data-panel-action="cancel-panel-mode">Cancel</button><button class="send-btn" data-panel-action="${editing ? 'update-character' : 'create-character'}" ${editing ? `data-id="${character.id}"` : ''}>${editing ? 'Save' : 'Create'}</button></div>
    </div>`;
}

function personaForm() {
  return `
    <div class="panel-section creation-card">
      <div class="section-title">|- Create persona</div>
      ${panelField('Name', 'personaName', '')}
      ${panelTextarea('Persona text', 'personaDescription', 'A short description of who you are in chats.')}
      <div class="field"><label>Optional image</label><input id="personaImage" type="file" accept="image/*" /></div>
      <div class="form-actions"><button class="small-action" data-panel-action="cancel-panel-mode">Cancel</button><button class="send-btn" data-panel-action="create-persona">Create</button></div>
    </div>`;
}

function panelField(label, id, value, type = 'text') {
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value ?? '')}" /></div>`;
}

function panelTextarea(label, id, placeholder = '', value = '') {
  return `<div class="field"><label>${label}</label><textarea id="${id}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></div>`;
}

function modelOptions() {
  const models = state.settings.models?.length ? state.settings.models : [state.settings.model || ''];
  return models.map(model => `<option value="${escapeHtml(model)}" ${model === state.settings.model ? 'selected' : ''}>${escapeHtml(model || 'fetch models')}</option>`).join('');
}

function toggleLine(id, label, checked) {
  return `<div class="prompt-line"><input id="${id}" class="toggle" type="checkbox" ${checked ? 'checked' : ''} /><span class="prompt-name">${label}</span><span class="prompt-role">ui</span></div>`;
}

function colorField(label, key, value) {
  return `<div class="field"><label>${label}</label><div class="color-field"><input type="color" id="${key}Picker" value="${value}" /><input id="${key}Hex" value="${value}" /></div></div>`;
}

function bindConnectionPanel() {
  const save = async () => {
    state.settings = await saveSettings({
      ...state.settings,
      baseUrl: document.getElementById('settingBaseUrl').value.trim(),
      apiKey: document.getElementById('settingApiKey').value,
      model: document.getElementById('settingModel').value,
      temperature: Number(document.getElementById('settingTemperature').value),
      topP: Number(document.getElementById('settingTopP').value),
      maxContext: Number(document.getElementById('settingMaxContext').value),
      maxOutput: Number(document.getElementById('settingMaxOutput').value)
    });
  };

  ['settingBaseUrl', 'settingApiKey', 'settingModel', 'settingTemperature', 'settingTopP', 'settingMaxContext', 'settingMaxOutput'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', save);
  });

  document.getElementById('connectModelsButton')?.addEventListener('click', async () => {
    const result = document.getElementById('connectionResult');
    const button = document.getElementById('connectModelsButton');
    await save();
    button.disabled = true;
    result.className = 'connection-result loading';
    result.textContent = 'Connecting through proxy...';
    setStatus('Connecting and fetching models through proxy...');
    try {
      const models = await fetchModels(state.settings);
      state.settings = await saveSettings({ ...state.settings, models, model: state.settings.model || models[0] || '' });
      renderPanel();
      setStatus(`Connected. Fetched ${models.length} model${models.length === 1 ? '' : 's'}.`);
      const nextResult = document.getElementById('connectionResult');
      if (nextResult) {
        nextResult.className = 'connection-result success';
        nextResult.textContent = `Connected. ${models.length} model${models.length === 1 ? '' : 's'} available.`;
      }
    } catch (error) {
      result.className = 'connection-result error';
      result.textContent = error.message || String(error);
      setStatus(`Connection failed: ${error.message || String(error)}`);
      button.disabled = false;
    }
  });
}

function bindSettingsPanel() {
  const save = async () => {
    const dialogue = document.getElementById('dialogueColorHex')?.value || state.settings.dialogueColor;
    const action = document.getElementById('actionColorHex')?.value || state.settings.actionColor;
    state.settings = await saveSettings({
      ...state.settings,
      showImages: document.getElementById('settingShowImages').checked,
      compactCards: document.getElementById('settingCompactCards').checked,
      alwaysShowActions: document.getElementById('settingAlwaysShowActions').checked,
      reasoningAlwaysExpanded: document.getElementById('settingReasoningExpanded').checked,
      reasoningCollapseWhenClosed: document.getElementById('settingReasoningCollapseWhenClosed')?.checked || false,
      reasoningStartTag: document.getElementById('settingReasoningStart').value || '<think>',
      reasoningEndTag: document.getElementById('settingReasoningEnd').value || '</think>',
      dialogueColor: dialogue,
      actionColor: action
    });
    applySettings();
  };

  ['settingShowImages', 'settingCompactCards', 'settingAlwaysShowActions', 'settingReasoningExpanded', 'settingReasoningCollapseWhenClosed', 'settingReasoningStart', 'settingReasoningEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async () => {
      await save();
      if (id === 'settingReasoningExpanded') renderPanel();
    });
  });

  bindColorPair('dialogueColor', save);
  bindColorPair('actionColor', save);
}

function bindColorPair(key, save) {
  const picker = document.getElementById(`${key}Picker`);
  const hex = document.getElementById(`${key}Hex`);
  picker?.addEventListener('input', () => {
    hex.value = picker.value;
    save();
  });
  hex?.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
      picker.value = hex.value;
      save();
    }
  });
}
