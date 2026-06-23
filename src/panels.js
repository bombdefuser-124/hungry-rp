import { fetchModels } from './api.js';
import { saveSettings } from './db.js';
import { applySettings } from './dom-settings.js';
import { icons } from './icons.js';
import { escapeHtml } from './reasoning.js';
import { state } from './state.js';
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
      ${panelField('Proxy URL', 'settingProxyUrl', state.settings.proxyUrl)}
      <div class="panel-note">Frontend requests only talk to this Python backend proxy. Provider calls are never made directly from the browser.</div>
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
  panelTitle.textContent = 'Presets';
  panelSubtitle.textContent = 'parsed prompt blocks';
  panelActions.innerHTML = `<button class="panel-action-button" title="Import preset">${icons.import}</button><button class="panel-action-button" title="Export preset">${icons.export}</button>`;
  panelBody.innerHTML = `
    <div class="panel-section"><div class="section-title">|- Active preset</div><div class="panel-note">Preset storage is ready in IndexedDB. Phase 2 keeps the UX shape from the showcase; full preset parsing can expand from this structure.</div></div>
    ${['The Premise', 'Variable Init', 'Writing Style Library', 'Character Anchor', 'Dynamic Progression'].map((name, index) => `
      <div class="prompt-block"><div class="prompt-block-head"><input class="toggle" type="checkbox" checked /><div class="prompt-block-main"><div class="prompt-block-name">${String(index + 1).padStart(2, '0')} // ${name}</div><div class="prompt-block-meta">system // parsed prompt block</div></div><div class="prompt-block-actions"><button class="edit-block-button">edit</button></div></div><div class="prompt-block-body"><div class="prompt-preview">Prompt block placeholder for ${name.toLowerCase()}.</div></div></div>`).join('')}`;
}

function renderCharacters(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Characters';
  panelSubtitle.textContent = 'character cards and images';
  panelActions.innerHTML = `<button class="panel-action-button" title="Import character">${icons.import}</button><button class="panel-action-button" title="Create character">${icons.add}</button>`;
  panelBody.innerHTML = '<div class="list-item active"><div class="image-thumb"></div><div><div class="item-name">Kael the Wanderer</div><div class="item-desc">default starter character</div></div></div>';
}

function renderPersonas(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Personas';
  panelSubtitle.textContent = 'user identities';
  panelActions.innerHTML = `<button class="panel-action-button" title="Import persona">${icons.import}</button><button class="panel-action-button" title="Create persona">${icons.add}</button>`;
  panelBody.innerHTML = '<div class="list-item active"><div class="image-thumb"></div><div><div class="item-name">Unnamed traveler</div><div class="item-desc">blank persona for quick starts</div></div></div>';
}

function renderSettings(panelTitle, panelSubtitle, panelActions, panelBody) {
  panelTitle.textContent = 'Settings';
  panelSubtitle.textContent = 'interface and reasoning';
  panelActions.innerHTML = '';
  panelBody.innerHTML = `
    <div class="panel-section">
      <div class="section-title">|- Interface</div>
      ${toggleLine('settingShowImages', 'Show character images', state.settings.showImages)}
      ${toggleLine('settingCompactCards', 'Compact message cards', state.settings.compactCards)}
      ${toggleLine('settingAlwaysShowActions', 'Always show action tab', state.settings.alwaysShowActions)}
    </div>
    <div class="panel-section">
      <div class="section-title">|- Reasoning</div>
      ${toggleLine('settingReasoningExpanded', 'Always expand reasoning', state.settings.reasoningAlwaysExpanded)}
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

function panelField(label, id, value, type = 'text') {
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value ?? '')}" /></div>`;
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
      proxyUrl: document.getElementById('settingProxyUrl').value.trim(),
      baseUrl: document.getElementById('settingBaseUrl').value.trim(),
      apiKey: document.getElementById('settingApiKey').value,
      model: document.getElementById('settingModel').value,
      temperature: Number(document.getElementById('settingTemperature').value),
      topP: Number(document.getElementById('settingTopP').value),
      maxContext: Number(document.getElementById('settingMaxContext').value),
      maxOutput: Number(document.getElementById('settingMaxOutput').value)
    });
  };

  ['settingProxyUrl', 'settingBaseUrl', 'settingApiKey', 'settingModel', 'settingTemperature', 'settingTopP', 'settingMaxContext', 'settingMaxOutput'].forEach(id => {
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
      reasoningStartTag: document.getElementById('settingReasoningStart').value || '<think>',
      reasoningEndTag: document.getElementById('settingReasoningEnd').value || '</think>',
      dialogueColor: dialogue,
      actionColor: action
    });
    applySettings();
  };

  ['settingShowImages', 'settingCompactCards', 'settingAlwaysShowActions', 'settingReasoningExpanded', 'settingReasoningStart', 'settingReasoningEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', save);
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
