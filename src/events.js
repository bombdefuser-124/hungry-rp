import {
  branchFrom,
  createNewChat,
  deleteActiveChat,
  deleteBranch,
  deleteMessage,
  editMessage,
  exportActiveChat,
  importChatFile,
  nodeById,
  renameActiveChat,
  renameBranch,
  retryFrom,
  sendUserMessage,
  switchBranch,
  switchChat,
  toggleReasoning
} from './actions.js';
import { renderPanel } from './panels.js';
import { state } from './state.js';
import { isAtMessageBottom, scrollMessagesToBottom, updateScrollDownButton } from './ui.js';

export function bindShellEvents() {
  bindSidePanel();
  bindRailButtons();
  bindChatControls();
  bindReplyInput();
  bindMessageScroll();
  document.addEventListener('click', handleDocumentClick);
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
    sidePanelCloseTimer = window.setTimeout(() => appShell.classList.remove('panel-expanded'), 220);
  });
}

function bindRailButtons() {
  document.querySelectorAll('.rail-button[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view;
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
