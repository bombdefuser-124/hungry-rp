import {
  addPromptToPreset,
  branchFrom,
  createCharacterFromPanel,
  createEmptyPreset,
  createNewChat,
  createPersonaFromPanel,
  deleteActiveChat,
  deleteBranch,
  deleteCharacter,
  deleteMessage,
  deletePersona,
  deletePreset,
  editMessage,
  editPresetPrompt,
  exportActiveChat,
  exportCharacter,
  exportPreset,
  importCharacterFromPicker,
  importChatFile,
  importFromSillyTavern,
  importPresetFromPicker,
  nodeById,
  renameActiveChat,
  renameBranch,
  retryFrom,
  selectCharacter,
  selectPersona,
  selectPreset,
  sendUserMessage,
  switchBranch,
  switchChat,
  togglePresetPrompt,
  togglePresetPromptExpanded,
  toggleReasoning,
  updateCharacterFromPanel,
  updatePresetPromptContent,
  updatePresetPromptRole
} from './actions.js';
import { openImageDialog } from './dialog.js';
import { renderPanel } from './panels.js';
import { activeCharacter, activePersona, activePreset, state } from './state.js';
import { isAtMessageBottom, scrollMessagesToBottom, updateScrollDownButton } from './ui.js';

export function bindShellEvents() {
  bindSidePanel();
  bindRailButtons();
  bindChatControls();
  bindReplyInput();
  bindMessageScroll();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('panel-action', event => handlePanelAction(event.detail));
}

function bindSidePanel() {
  const appShell = document.getElementById('appShell');
  const sidePanel = document.getElementById('sidePanel');
  let sidePanelCloseTimer = null;

  sidePanel.addEventListener('mouseenter', () => {
    window.clearTimeout(sidePanelCloseTimer);
    appShell.classList.add('panel-expanded');
  });

  sidePanel.addEventListener('mouseleave', () => {
    window.clearTimeout(sidePanelCloseTimer);
    sidePanelCloseTimer = window.setTimeout(() => {
      if (document.body.classList.contains('image-lightbox-open')) return;
      appShell.classList.remove('panel-expanded');
    }, 800);
  });
}

function bindRailButtons() {
  document.querySelectorAll('.rail-button[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view;
      state.panelMode = null;
      renderPanel();
      button.blur();
    });
  });
}

function bindChatControls() {
  document.getElementById('newChatButton').addEventListener('click', createNewChat);
  document.getElementById('renameChatButton').addEventListener('click', renameActiveChat);
  document.getElementById('deleteChatButton').addEventListener('click', deleteActiveChat);
  document.getElementById('chatSelect').addEventListener('change', event => switchChat(event.target.value));
  document.getElementById('importChatButton').addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', importChatFile);
  document.getElementById('exportChatButton').addEventListener('click', exportActiveChat);
  document.getElementById('sendButton').addEventListener('click', sendUserMessage);
}

function bindMessageScroll() {
  const messages = document.getElementById('chatMessages');
  const downButton = document.getElementById('scrollDownButton');

  messages.addEventListener('scroll', () => {
    state.autoScrollToBottom = isAtMessageBottom();
    updateScrollDownButton();
  }, { passive: true });

  downButton.addEventListener('click', () => scrollMessagesToBottom(true));
}

function bindReplyInput() {
  const input = document.getElementById('replyInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendUserMessage();
    }
  });
}

async function handleDocumentClick(event) {
  const imageButton = event.target.closest('[data-open-message-image]');
  if (imageButton) {
    event.preventDefault();
    const node = nodeById(imageButton.dataset.messageId);
    const image = imageForMessage(node);
    if (image) openImageDialog({ src: image, title: imageTitleForMessage(node) });
    return;
  }

  const panelButton = event.target.closest('[data-panel-action]');
  if (panelButton) {
    event.preventDefault();
    event.stopPropagation();
    await handlePanelAction({ action: panelButton.dataset.panelAction, id: panelButton.dataset.id });
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;

    if (action === 'rename-branch') {
      await renameBranch(actionButton.dataset.branchId);
      return;
    }
    if (action === 'delete-branch') {
      await deleteBranch(actionButton.dataset.branchId);
      return;
    }

    const node = nodeById(actionButton.dataset.messageId);
    if (!node) return;

    if (action === 'copy') await navigator.clipboard.writeText(node.content || '');
    if (action === 'branch') await branchFrom(node);
    if (action === 'edit') await editMessage(node);
    if (action === 'retry') await retryFrom(node);
    if (action === 'delete-message') await deleteMessage(node);
    if (action === 'toggle-reasoning') await toggleReasoning(node, actionButton.dataset.reasoningId);
    return;
  }

  const branchRow = event.target.closest('.branch-row[data-branch-id]');
  if (branchRow) await switchBranch(branchRow.dataset.branchId);
}

function imageForMessage(node) {
  if (!node || node.role === 'system') return '';
  if (node.role === 'user') return activePersona()?.image || '';
  if (node.role === 'assistant') {
    const character = state.characters.find(item => item.id === state.activeChat?.characterId) || activeCharacter();
    return character?.image || '';
  }
  return '';
}

function imageTitleForMessage(node) {
  if (node?.role === 'user') return activePersona()?.name || 'Persona image';
  if (node?.role === 'assistant') return activeCharacter()?.name || state.activeChat?.characterName || 'Character image';
  return 'Image preview';
}

async function handlePanelAction({ action, id, role, content } = {}) {
  if (!action) return;

  if (action === 'show-character-create') {
    state.panelMode = 'create-character';
    renderPanel();
  }
  if (action === 'edit-character') {
    state.panelMode = `edit-character:${id}`;
    renderPanel();
  }
  if (action === 'show-persona-create') {
    state.panelMode = 'create-persona';
    renderPanel();
  }
  if (action === 'cancel-panel-mode') {
    state.panelMode = null;
    renderPanel();
  }
  if (action === 'import-character') await importCharacterFromPicker();
  if (action === 'create-character') await createCharacterFromPanel();
  if (action === 'update-character') await updateCharacterFromPanel(id);
  if (action === 'select-character') await selectCharacter(id);
  if (action === 'delete-character') await deleteCharacter(id);
  if (action === 'export-character') exportCharacter(id || activeCharacter()?.id);

  if (action === 'create-empty-preset') await createEmptyPreset();
  if (action === 'import-preset') await importPresetFromPicker();
  if (action === 'select-preset') await selectPreset(id);
  if (action === 'delete-preset') await deletePreset(id || activePreset()?.id);
  if (action === 'add-preset-prompt') await addPromptToPreset();
  if (action === 'toggle-prompt') await togglePresetPrompt(id);
  if (action === 'toggle-prompt-expanded') await togglePresetPromptExpanded(id);
  if (action === 'edit-prompt') await editPresetPrompt(id);
  if (action === 'update-prompt-role') await updatePresetPromptRole(id, role);
  if (action === 'update-prompt-content') await updatePresetPromptContent(id, content || '');
  if (action === 'export-preset') exportPreset(id || activePreset()?.id);

  if (action === 'import-sillytavern') await importFromSillyTavern();

  if (action === 'create-persona') await createPersonaFromPanel();
  if (action === 'select-persona') await selectPersona(id);
  if (action === 'delete-persona') await deletePersona(id);
}
