import { importSillyTavern, scanSillyTavern, streamChat } from './api.js';
import { deleteChat, deleteStoreItem, getChats, getStoreItems, saveChat, saveSettings, saveStoreItem } from './db.js';
import {
  activeBranch,
  activePath,
  branchBookmarks,
  createChat,
  descendantIds,
  getNode,
  newId,
  nowTime,
  persistActiveChat,
  setActiveBranch,
  setActiveLeaf
} from './chat-model.js';
import { characterToCard, createCharacterFromForm, createDefaultPreset, createImageThumbnail, createPersonaFromForm, fileToDataUrl, isContextSlotPrompt, normalizeCharacterCard, parseCharacterFile, parsePresetFilePayload, presetToExport } from './content-parsers.js';
import { openConfirmDialog, openSillyTavernImportDialog, openTextDialog } from './dialog.js';
import { createReasoningParser } from './reasoning.js';
import { activeCharacter, activePersona, activePreset, chatsForCharacter, state } from './state.js';
import { setStatus } from './status.js';
import { render, renderMessages } from './ui.js';

function currentCharacterChats() {
  const character = activeCharacter();
  return chatsForCharacter(character?.id || state.settings.activeCharacterId || '');
}

async function activateFirstChatForCurrentCharacter(createIfMissing = true) {
  const character = activeCharacter();
  const scopedChats = currentCharacterChats();
  if (state.activeChat && scopedChats.some(chat => chat.id === state.activeChat.id)) return state.activeChat;
  if (scopedChats.length) {
    state.activeChat = scopedChats[0];
    state.autoScrollToBottom = true;
    return state.activeChat;
  }
  if (!createIfMissing) {
    state.activeChat = null;
    return null;
  }
  state.activeChat = createChat(`Roleplay ${scopedChats.length + 1}`, character);
  await persistActiveChat();
  state.autoScrollToBottom = true;
  return state.activeChat;
}

export async function createNewChat() {
  const character = activeCharacter();
  state.activeChat = createChat(`Roleplay ${currentCharacterChats().length + 1}`, character);
  await persistActiveChat();
  state.autoScrollToBottom = true;
  setStatus(`Created ${state.activeChat.title} for ${character?.name || 'this character'}.`);
  render();
}

export async function renameActiveChat() {
  if (!state.activeChat) return;
  const next = await openTextDialog({
    title: 'Rename chat',
    label: 'Chat title',
    value: state.activeChat.title,
    confirmText: 'Rename'
  });
  if (next === null) return;
  state.activeChat.title = next.trim() || state.activeChat.title;
  await persistActiveChat();
  render();
}

export async function deleteActiveChat() {
  if (!state.activeChat) return;
  const ok = await openConfirmDialog({
    title: 'Delete chat',
    message: `Delete "${state.activeChat.title}"? This cannot be undone.`,
    confirmText: 'Delete chat'
  });
  if (!ok) return;

  await deleteChat(state.activeChat.id);
  state.chats = await getChats();
  await activateFirstChatForCurrentCharacter(true);
  setStatus('Chat deleted.');
  render();
}

export function switchChat(id) {
  const chat = currentCharacterChats().find(item => item.id === id);
  if (!chat) return;
  state.activeChat = chat;
  state.autoScrollToBottom = true;
  render();
}

export async function switchBranch(branchId) {
  setActiveBranch(state.activeChat, branchId);
  state.autoScrollToBottom = true;
  await persistActiveChat();
  render();
}

export async function branchFrom(node) {
  const branchNumber = branchBookmarks().length + 1;
  const branch = {
    id: newId('branch'),
    name: `branch ${branchNumber}`,
    baseLeafId: node.id,
    leafId: node.id,
    firstNodeId: null,
    createdAt: new Date().toISOString()
  };
  state.activeChat.branchBookmarks.push(branch);
  setActiveBranch(state.activeChat, branch.id);
  await persistActiveChat();
  setStatus(`Created ${branch.name} from this message.`);
  render();
}

export async function renameBranch(branchId) {
  const branch = branchBookmarks().find(item => item.id === branchId);
  if (!branch) return;
  const next = await openTextDialog({
    title: 'Rename branch',
    label: 'Branch name',
    value: branch.name,
    confirmText: 'Rename'
  });
  if (next === null) return;
  branch.name = next.trim() || branch.name;
  await persistActiveChat();
  render();
}

export async function deleteBranch(branchId) {
  const branches = branchBookmarks();
  const branch = branches.find(item => item.id === branchId);
  if (!branch) return;
  if (branches.length <= 1) {
    setStatus('Cannot delete the only branch.');
    return;
  }

  const ok = await openConfirmDialog({
    title: 'Delete branch',
    message: `Delete "${branch.name}"? Messages unique to this branch will be removed when possible.`,
    confirmText: 'Delete branch'
  });
  if (!ok) return;

  if (branch.firstNodeId) {
    const doomed = descendantIds(state.activeChat, branch.firstNodeId);
    for (const id of doomed) delete state.activeChat.nodes[id];
    for (const item of state.activeChat.branchBookmarks) {
      if (item.id !== branch.id && doomed.has(item.leafId)) item.leafId = branch.baseLeafId || null;
    }
  }

  state.activeChat.branchBookmarks = state.activeChat.branchBookmarks.filter(item => item.id !== branch.id);
  if (state.activeChat.activeBranchId === branch.id) setActiveBranch(state.activeChat, state.activeChat.branchBookmarks[0].id);
  await persistActiveChat();
  setStatus('Branch deleted.');
  render();
}

export async function editMessage(node) {
  const next = await openTextDialog({
    title: 'Edit message',
    label: 'Message text',
    value: node.content,
    confirmText: 'Save',
    multiline: true
  });
  if (next === null) return;
  node.content = next;
  node.reasoningBlocks = [];
  await persistActiveChat();
  render();
}

export async function deleteMessage(node) {
  const ok = await openConfirmDialog({
    title: 'Delete message',
    message: 'Delete this message and its continuations?',
    confirmText: 'Delete message'
  });
  if (!ok) return;

  const doomed = descendantIds(state.activeChat, node.id);
  for (const id of doomed) delete state.activeChat.nodes[id];

  for (const branch of state.activeChat.branchBookmarks) {
    if (doomed.has(branch.leafId)) branch.leafId = node.parentId || null;
    if (doomed.has(branch.firstNodeId)) branch.firstNodeId = null;
  }
  if (doomed.has(state.activeChat.activeLeafId)) setActiveLeaf(state.activeChat, node.parentId || null);

  await persistActiveChat();
  setStatus('Message deleted.');
  render();
}

export async function retryFrom(node) {
  if (state.generating) return;
  setActiveLeaf(state.activeChat, node.role === 'assistant' && node.parentId ? node.parentId : node.id);
  await persistActiveChat();
  render();
  await generateAssistant();
}

export async function toggleReasoning(node, reasoningId) {
  const block = (node.reasoningBlocks || []).find(item => item.id === reasoningId);
  if (!block) return;
  block.collapsed = !block.collapsed;
  await persistActiveChat();
  render();
}

export async function sendUserMessage() {
  if (state.generating) {
    interruptGeneration();
    return;
  }
  const input = document.getElementById('replyInput');
  const content = input.value.trim();
  if (!content) return;

  const node = {
    id: newId('msg'),
    parentId: state.activeChat.activeLeafId,
    role: 'user',
    name: activePersona()?.name || 'you',
    content,
    reasoningBlocks: [],
    createdAt: new Date().toISOString()
  };

  state.activeChat.nodes[node.id] = node;
  setActiveLeaf(state.activeChat, node.id);
  state.autoScrollToBottom = true;
  input.value = '';
  input.style.height = 'auto';
  await persistActiveChat();
  render();
  await generateAssistant();
}

function providerMessagesUntilAssistant(assistantId) {
  const messages = [];
  const preset = activePreset();
  const character = activeCharacterForChat();
  const persona = activePersona();

  const history = activePath().filter(node => node.id !== assistantId).map(node => ({
    role: node.role === 'assistant' ? 'assistant' : node.role,
    content: node.content
  }));

  if (preset) {
    let insertedHistory = false;
    for (const prompt of (preset.prompts || []).filter(item => item.enabled !== false)) {
      if (prompt.identifier === 'chatHistory') {
        messages.push(...history);
        insertedHistory = true;
        continue;
      }
      const content = contentForPresetPrompt(prompt, character, persona);
      if (content) messages.push({ role: normalizeRole(prompt.role), content });
    }
    if (!insertedHistory) messages.push(...history);
    return messages;
  }

  const context = buildRoleplayContext(character, persona);
  if (context) messages.push({ role: 'system', content: context });
  return messages.concat(history);
}

function normalizeRole(role) {
  return ['system', 'user', 'assistant'].includes(role) ? role : 'system';
}

function activeCharacterForChat() {
  if (state.activeChat?.characterId) {
    return state.characters.find(character => character.id === state.activeChat.characterId) || activeCharacter();
  }
  return activeCharacter();
}

function contentForPresetPrompt(prompt, character, persona) {
  if (!isContextSlotPrompt(prompt)) return renderTemplate(prompt.content || '', character, persona);

  if (prompt.identifier === 'charDescription') return character?.description ? `Character description:\n${renderTemplate(character.description, character, persona)}` : '';
  if (prompt.identifier === 'charPersonality') return character?.personality ? `Character personality:\n${renderTemplate(character.personality, character, persona)}` : '';
  if (prompt.identifier === 'scenario') return character?.scenario ? `Scenario:\n${renderTemplate(character.scenario, character, persona)}` : '';
  if (prompt.identifier === 'personaDescription') return persona ? `Persona (${persona.name}):\n${renderTemplate(persona.description || persona.name, character, persona)}` : '';
  if (prompt.identifier === 'dialogueExamples') return character?.messageExample ? renderTemplate(character.messageExample, character, persona) : '';
  if (prompt.identifier === 'worldInfoBefore' || prompt.identifier === 'worldInfoAfter') return '';
  return '';
}

function renderTemplate(content, character, persona) {
  return String(content || '').replaceAll('{{char}}', character?.name || 'the character').replaceAll('{{user}}', persona?.name || 'you');
}

function buildRoleplayContext(character, persona) {
  const chunks = [];
  if (character) {
    chunks.push(`You are roleplaying as {{char}}.\n{{char}} name: ${character.name}`);
    if (character.description) chunks.push(`Character description:\n${character.description}`);
    if (character.personality) chunks.push(`Character personality:\n${character.personality}`);
    if (character.scenario) chunks.push(`Scenario:\n${character.scenario}`);
    if (character.systemPrompt) chunks.push(`Character system prompt:\n${character.systemPrompt}`);
    if (character.messageExample) chunks.push(`Example dialogue:\n${character.messageExample}`);
    if (character.postHistoryInstructions) chunks.push(`Post-history instructions:\n${character.postHistoryInstructions}`);
  }
  if (persona) chunks.push(`{{user}} persona (${persona.name}):\n${persona.description || persona.name}`);
  return renderTemplate(chunks.join('\n\n'), character, persona);
}

export async function generateAssistant() {
  if (!state.settings.model) {
    setStatus('Select a model first. Open Connections and connect to fetch models through the proxy.');
    return;
  }

  const character = activeCharacterForChat();
  const assistant = {
    id: newId('msg'),
    parentId: state.activeChat.activeLeafId,
    role: 'assistant',
    name: state.activeChat.characterName || character?.name || 'assistant',
    content: '',
    reasoningBlocks: [],
    streaming: true,
    createdAt: new Date().toISOString()
  };

  state.activeChat.nodes[assistant.id] = assistant;
  setActiveLeaf(state.activeChat, assistant.id);
  state.autoScrollToBottom = true;
  state.generating = true;
  setStatus(`Streaming from ${state.settings.model} through Python proxy...`);
  render();

  const parser = createReasoningParser(state.settings);
  let collapsedReasoningAfterClose = false;
  const preserveReasoningCollapse = incomingBlocks => {
    const existing = new Map((assistant.reasoningBlocks || []).map(block => [block.id, block.collapsed]));
    return incomingBlocks.map(block => existing.has(block.id) ? { ...block, collapsed: existing.get(block.id) } : block);
  };
  const applyStreamingSnapshot = snapshot => {
    assistant.content = snapshot.visible;
    assistant.reasoningBlocks = preserveReasoningCollapse(snapshot.reasoningBlocks);
  };
  const collapseClosedReasoningBlocks = snapshot => {
    if (collapsedReasoningAfterClose) return;
    if (!state.settings.reasoningAlwaysExpanded || !state.settings.reasoningCollapseWhenClosed) return;
    if (!snapshot.visible || !(snapshot.reasoningBlocks || []).length) return;
    collapsedReasoningAfterClose = true;
    assistant.reasoningBlocks = (assistant.reasoningBlocks || []).map(block => ({ ...block, collapsed: true }));
  };
  let done = false;
  let interrupted = false;
  let renderTimer = null;
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      renderMessages();
    }, 80);
  };

  const finish = async () => {
    if (done) return;
    done = true;
    const snapshot = parser.finalize();
    applyStreamingSnapshot(snapshot);
    assistant.streaming = false;
    state.generating = false;
    state.generationController = null;
    await persistActiveChat();
    render();
    setStatus(interrupted ? `Interrupted at ${nowTime()}.` : `Done at ${nowTime()}.`);
  };

  try {
    await streamChat(state.settings, providerMessagesUntilAssistant(assistant.id), {
      onController: controller => {
        state.generationController = controller;
      },
      onReasoningToken: token => {
        const snapshot = parser.absorbReasoning(token);
        applyStreamingSnapshot(snapshot);
        collapseClosedReasoningBlocks(snapshot);
        scheduleRender();
      },
      onToken: token => {
        const snapshot = parser.absorb(token);
        applyStreamingSnapshot(snapshot);
        collapseClosedReasoningBlocks(snapshot);
        scheduleRender();
      },
      onAbort: () => {
        interrupted = true;
      },
      onDone: finish,
      onError: message => {
        assistant.content += `\n[Proxy error] ${message}`;
        finish();
      }
    });
    await finish();
  } catch (error) {
    if (error.name === 'AbortError') interrupted = true;
    else assistant.content += `\n[Proxy error] ${error.message || String(error)}`;
    await finish();
  }
}

export function interruptGeneration() {
  if (!state.generating || !state.generationController) return;
  setStatus('Interrupting generation...');
  state.generationController.abort();
}

export async function importChatFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const chat = payload.chat || payload;
    if (!chat.nodes || !Object.prototype.hasOwnProperty.call(chat, 'activeLeafId')) throw new Error('Invalid chat export');
    const character = activeCharacter();
    chat.id = chat.id || newId('chat');
    chat.title = chat.title || file.name.replace(/\.json$/i, '');
    const exportedCharacterExists = chat.characterId && state.characters.some(item => item.id === chat.characterId);
    if (!exportedCharacterExists) {
      chat.characterId = character?.id || null;
      chat.characterName = character?.name || 'Character';
    } else {
      chat.characterName = chat.characterName || state.characters.find(item => item.id === chat.characterId)?.name || 'Character';
    }
    state.activeChat = await saveChat(chat);
    if (chat.characterId && chat.characterId !== state.settings.activeCharacterId) {
      state.settings = await saveSettings({ ...state.settings, activeCharacterId: chat.characterId });
    }
    state.chats = await getChats();
    state.autoScrollToBottom = true;
    setStatus(`Imported chat ${chat.title}.`);
    render();
  } catch (error) {
    setStatus(`Chat import failed: ${error.message || String(error)}`);
  } finally {
    event.target.value = '';
  }
}

export function exportActiveChat() {
  if (!state.activeChat) return;
  downloadJson(`${state.activeChat.title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.json`, { version: 1, chat: state.activeChat });
}

export async function importFromSillyTavern() {
  const path = await openTextDialog({
    title: 'Import from SillyTavern',
    label: 'SillyTavern install folder',
    value: '',
    confirmText: 'Scan'
  });
  if (path === null) return;

  try {
    setStatus('Scanning SillyTavern userdata...');
    const scan = await scanSillyTavern(state.settings, path.trim());
    const selection = await openSillyTavernImportDialog(scan);
    if (!selection) return;

    const selectedCount = selection.characters.length + selection.personas.length + selection.presets.length;
    if (!selectedCount) {
      setStatus('Nothing selected for import.');
      return;
    }

    setStatus('Importing selected SillyTavern userdata...');
    const imported = await importSillyTavern(state.settings, { path: path.trim(), ...selection });

    let characterCount = 0;
    for (const item of imported.characters || []) {
      const character = normalizeCharacterCard(item.card, item.sourceName, item.image);
      if (character.image) character.thumbnail = await createImageThumbnail(character.image);
      await saveStoreItem('characters', character);
      characterCount += 1;
      if (!state.settings.activeCharacterId) state.settings = await saveSettings({ ...state.settings, activeCharacterId: character.id });
    }

    let personaCount = 0;
    for (const item of imported.personas || []) {
      const persona = {
        id: newId('persona'),
        name: item.name || 'Imported persona',
        description: item.description || '',
        image: item.image || null,
        sourceName: item.sourceName || 'SillyTavern',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveStoreItem('personas', persona);
      personaCount += 1;
      if (!state.settings.activePersonaId) state.settings = await saveSettings({ ...state.settings, activePersonaId: persona.id });
    }

    let presetCount = 0;
    for (const item of imported.presets || []) {
      const preset = parsePresetFilePayload(item.preset, item.sourceName);
      await saveStoreItem('presets', preset);
      presetCount += 1;
      if (!state.settings.activePresetId) state.settings = await saveSettings({ ...state.settings, activePresetId: preset.id });
    }

    state.characters = await getStoreItems('characters');
    state.personas = await getStoreItems('personas');
    state.presets = await getStoreItems('presets');
    setStatus(`Imported ${characterCount} character(s), ${personaCount} persona(s), ${presetCount} preset(s).`);
    render();
  } catch (error) {
    setStatus(`SillyTavern import failed: ${error.message || String(error)}`);
  }
}

export async function importCharacterFromPicker() {
  const file = await pickFile('application/json,.json,image/png,.png,.apng');
  if (!file) return;
  try {
    const character = await parseCharacterFile(file);
    if (character.image) character.thumbnail = await createImageThumbnail(character.image);
    await saveStoreItem('characters', character);
    state.characters = await getStoreItems('characters');
    state.settings = await saveSettings({ ...state.settings, activeCharacterId: character.id });
    state.panelMode = null;
    setStatus(`Imported character ${character.name}.`);
    render();
  } catch (error) {
    setStatus(`Character import failed: ${error.message || String(error)}`);
  }
}

export async function createCharacterFromPanel() {
  try {
    const imageData = document.getElementById('characterImageData')?.value || '';
    const imageFile = document.getElementById('characterImage')?.files?.[0];
    const image = imageData || (imageFile ? await fileToDataUrl(imageFile) : null);
    const character = createCharacterFromForm({
      name: document.getElementById('characterName')?.value.trim(),
      description: document.getElementById('characterDescription')?.value.trim(),
      personality: document.getElementById('characterPersonality')?.value.trim(),
      scenario: document.getElementById('characterScenario')?.value.trim(),
      firstMessage: document.getElementById('characterFirstMessage')?.value.trim(),
      messageExample: document.getElementById('characterExample')?.value.trim(),
      systemPrompt: document.getElementById('characterSystemPrompt')?.value.trim(),
      image
    });
    if (character.image) character.thumbnail = await createImageThumbnail(character.image);
    await saveStoreItem('characters', character);
    state.characters = await getStoreItems('characters');
    state.settings = await saveSettings({ ...state.settings, activeCharacterId: character.id });
    state.panelMode = null;
    setStatus(`Created character ${character.name}.`);
    render();
  } catch (error) {
    setStatus(`Character creation failed: ${error.message || String(error)}`);
  }
}

export async function updateCharacterFromPanel(id) {
  const current = state.characters.find(item => item.id === id);
  if (!current) {
    setStatus('Character edit failed: character not found.');
    return;
  }

  try {
    const imageData = document.getElementById('characterImageData')?.value || '';
    const imageFile = document.getElementById('characterImage')?.files?.[0];
    const replacementImage = imageData || (imageFile ? await fileToDataUrl(imageFile) : '');
    const updated = {
      ...current,
      name: document.getElementById('characterName')?.value.trim() || current.name || 'Unnamed character',
      description: document.getElementById('characterDescription')?.value.trim() || '',
      personality: document.getElementById('characterPersonality')?.value.trim() || '',
      scenario: document.getElementById('characterScenario')?.value.trim() || '',
      firstMessage: document.getElementById('characterFirstMessage')?.value.trim() || '',
      messageExample: document.getElementById('characterExample')?.value.trim() || '',
      systemPrompt: document.getElementById('characterSystemPrompt')?.value.trim() || '',
      image: replacementImage || current.image,
      thumbnail: replacementImage ? await createImageThumbnail(replacementImage) : current.thumbnail,
      updatedAt: new Date().toISOString()
    };

    await saveStoreItem('characters', updated);
    state.characters = await getStoreItems('characters');

    if (state.activeChat?.characterId === updated.id) {
      state.activeChat.characterName = updated.name;
      await persistActiveChat();
    }

    state.panelMode = null;
    setStatus(`Updated character ${updated.name}.`);
    render();
  } catch (error) {
    setStatus(`Character edit failed: ${error.message || String(error)}`);
  }
}

export async function selectCharacter(id) {
  const character = state.characters.find(item => item.id === id);
  if (!character) return;
  state.settings = await saveSettings({ ...state.settings, activeCharacterId: character.id });
  await activateFirstChatForCurrentCharacter(true);
  setStatus(`Selected character ${character.name}. Showing only this character's chats.`);
  render();
}

export async function deleteCharacter(id) {
  const character = state.characters.find(item => item.id === id);
  if (!character) return;
  const ok = await openConfirmDialog({ title: 'Delete character', message: `Delete "${character.name}"?`, confirmText: 'Delete character' });
  if (!ok) return;
  await deleteStoreItem('characters', id);
  state.characters = await getStoreItems('characters');
  const nextActive = state.settings.activeCharacterId === id ? (state.characters[0]?.id || '') : state.settings.activeCharacterId;
  state.settings = await saveSettings({ ...state.settings, activeCharacterId: nextActive });
  await activateFirstChatForCurrentCharacter(true);
  setStatus('Character deleted.');
  render();
}

export function exportCharacter(id) {
  const character = state.characters.find(item => item.id === id) || activeCharacter();
  if (!character) return;
  downloadJson(`${safeName(character.name)}.character.json`, characterToCard(character));
}

export async function importPresetFromPicker() {
  const file = await pickFile('application/json,.json');
  if (!file) return;
  try {
    const preset = parsePresetFilePayload(JSON.parse(await file.text()), file.name);
    await saveStoreItem('presets', preset);
    state.presets = await getStoreItems('presets');
    state.settings = await saveSettings({ ...state.settings, activePresetId: preset.id });
    setStatus(`Imported preset ${preset.name} with ${preset.prompts.length} prompt blocks.`);
    render();
  } catch (error) {
    setStatus(`Preset import failed: ${error.message || String(error)}`);
  }
}

export async function selectPreset(id) {
  const preset = state.presets.find(item => item.id === id);
  if (!preset) return;
  state.settings = await saveSettings({ ...state.settings, activePresetId: preset.id });
  render();
}

export async function deletePreset(id) {
  const preset = state.presets.find(item => item.id === id);
  if (!preset) return;
  const ok = await openConfirmDialog({ title: 'Delete preset', message: `Delete "${preset.name}"?`, confirmText: 'Delete preset' });
  if (!ok) return;
  await deleteStoreItem('presets', id);
  state.presets = await getStoreItems('presets');
  const nextActive = state.settings.activePresetId === id ? (state.presets[0]?.id || '') : state.settings.activePresetId;
  state.settings = await saveSettings({ ...state.settings, activePresetId: nextActive });
  setStatus('Preset deleted.');
  render();
}

export async function createEmptyPreset() {
  const name = await openTextDialog({
    title: 'Create empty preset',
    label: 'Preset name',
    value: `Preset ${state.presets.length + 1}`,
    confirmText: 'Create'
  });
  if (name === null) return;

  const preset = createDefaultPreset(name.trim() || `Preset ${state.presets.length + 1}`);

  await saveStoreItem('presets', preset);
  state.presets = await getStoreItems('presets');
  state.settings = await saveSettings({ ...state.settings, activePresetId: preset.id });
  setStatus(`Created preset ${preset.name}.`);
  render();
}

export async function addPromptToPreset() {
  const preset = activePreset();
  if (!preset) return;
  const index = (preset.prompts || []).length + 1;
  const name = await openTextDialog({
    title: 'Add prompt block',
    label: 'Prompt name',
    value: `Prompt ${index}`,
    confirmText: 'Add'
  });
  if (name === null) return;

  preset.prompts = preset.prompts || [];
  const insertAt = preset.prompts.findIndex(prompt => prompt.pinned || isContextSlotPrompt(prompt));
  const prompt = {
    id: newId('prompt'),
    identifier: `prompt_${index}`,
    name: name.trim() || `Prompt ${index}`,
    role: 'system',
    content: '',
    enabled: true,
    expanded: true,
    marker: false,
    pinned: false,
    injectionPosition: 0,
    injectionDepth: 4,
    injectionOrder: index * 100,
    injectionTrigger: [],
    meta: {}
  };
  if (insertAt === -1) preset.prompts.push(prompt);
  else preset.prompts.splice(insertAt, 0, prompt);
  preset.updatedAt = new Date().toISOString();
  await saveStoreItem('presets', preset);
  state.presets = await getStoreItems('presets');
  setStatus('Added prompt block. Choose its role and write its text.');
  render();
}

export async function togglePresetPrompt(promptId) {
  const preset = activePreset();
  const prompt = preset?.prompts?.find(item => item.id === promptId);
  if (!preset || !prompt) return;
  prompt.enabled = !prompt.enabled;
  preset.updatedAt = new Date().toISOString();
  await saveStoreItem('presets', preset);
  state.presets = await getStoreItems('presets');
  render();
}

export async function editPresetPrompt(promptId) {
  const preset = activePreset();
  const prompt = preset?.prompts?.find(item => item.id === promptId);
  if (!preset || !prompt) return;
  const next = await openTextDialog({ title: 'Edit prompt block', label: prompt.name, value: prompt.content, confirmText: 'Save block', multiline: true });
  if (next === null) return;
  prompt.content = next;
  preset.updatedAt = new Date().toISOString();
  await saveStoreItem('presets', preset);
  state.presets = await getStoreItems('presets');
  render();
}

export async function togglePresetPromptExpanded(promptId) {
  const preset = activePreset();
  const prompt = preset?.prompts?.find(item => item.id === promptId);
  if (!preset || !prompt) return;
  prompt.expanded = !prompt.expanded;
  preset.updatedAt = new Date().toISOString();
  await saveStoreItem('presets', preset);
  state.presets = await getStoreItems('presets');
  render();
}

export async function updatePresetPromptRole(promptId, role) {
  const preset = activePreset();
  const prompt = preset?.prompts?.find(item => item.id === promptId);
  if (!preset || !prompt) return;
  prompt.role = normalizeRole(role);
  preset.updatedAt = new Date().toISOString();
  await saveStoreItem('presets', preset);
  state.presets = await getStoreItems('presets');
  render();
}

export async function updatePresetPromptContent(promptId, content) {
  const preset = activePreset();
  const prompt = preset?.prompts?.find(item => item.id === promptId);
  if (!preset || !prompt) return;
  prompt.content = content;
  preset.updatedAt = new Date().toISOString();
  await saveStoreItem('presets', preset);
}

export function exportPreset(id) {
  const preset = state.presets.find(item => item.id === id) || activePreset();
  if (!preset) return;
  downloadJson(`${safeName(preset.name)}.preset.json`, presetToExport(preset));
}

export async function createPersonaFromPanel() {
  try {
    const imageFile = document.getElementById('personaImage')?.files?.[0];
    const persona = createPersonaFromForm({
      name: document.getElementById('personaName')?.value.trim(),
      description: document.getElementById('personaDescription')?.value.trim(),
      image: imageFile ? await fileToDataUrl(imageFile) : null
    });
    await saveStoreItem('personas', persona);
    state.personas = await getStoreItems('personas');
    state.settings = await saveSettings({ ...state.settings, activePersonaId: persona.id });
    state.panelMode = null;
    setStatus(`Created persona ${persona.name}.`);
    render();
  } catch (error) {
    setStatus(`Persona creation failed: ${error.message || String(error)}`);
  }
}

export async function selectPersona(id) {
  const persona = state.personas.find(item => item.id === id);
  if (!persona) return;
  state.settings = await saveSettings({ ...state.settings, activePersonaId: persona.id });
  setStatus(`Selected persona ${persona.name}.`);
  render();
}

export async function deletePersona(id) {
  const persona = state.personas.find(item => item.id === id);
  if (!persona) return;
  const ok = await openConfirmDialog({ title: 'Delete persona', message: `Delete "${persona.name}"?`, confirmText: 'Delete persona' });
  if (!ok) return;
  await deleteStoreItem('personas', id);
  state.personas = await getStoreItems('personas');
  const nextActive = state.settings.activePersonaId === id ? (state.personas[0]?.id || '') : state.settings.activePersonaId;
  state.settings = await saveSettings({ ...state.settings, activePersonaId: nextActive });
  setStatus('Persona deleted.');
  render();
}

export function nodeById(id) {
  return getNode(state.activeChat, id);
}

export function currentBranch() {
  return activeBranch(state.activeChat);
}

function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeName(name) {
  return (name || 'export').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export';
}
