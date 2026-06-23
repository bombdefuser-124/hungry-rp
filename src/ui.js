import { activePath, branchBookmarks, branchLabel } from './chat-model.js';
import { applySettings } from './dom-settings.js';
import { icons } from './icons.js';
import { renderPanel } from './panels.js';
import { escapeHtml, formatMessageContent } from './reasoning.js';
import { activePersona, state } from './state.js';
import { syncStatus } from './status.js';

export function renderShell() {
  const appShell = document.getElementById('appShell');
  appShell.innerHTML = `
    <main class="chat-area">
      <header class="chat-header">
        <div class="branch-root">
          <button class="branch-tree-button" aria-label="Open branch tree">${icons.tree}</button>
          <div class="branch-tree-menu" id="branchTreeMenu"></div>
        </div>
        <div class="chat-title-block">
          <div class="character-title" id="characterTitle"></div>
          <div class="chat-meta" id="chatMeta"></div>
        </div>
        <div class="chat-toolbar">
          <select class="chat-select" id="chatSelect" aria-label="Active chat"></select>
          <button class="icon-action" id="renameChatButton" title="Rename chat">${icons.edit}</button>
          <button class="icon-action danger-icon" id="deleteChatButton" title="Delete chat">${icons.delete}</button>
          <button class="small-action" id="newChatButton">New chat</button>
          <button class="icon-action" id="importChatButton" title="Import chat">${icons.import}</button>
          <button class="icon-action" id="exportChatButton" title="Export chat">${icons.export}</button>
          <input id="importFileInput" type="file" accept="application/json,.json" hidden />
        </div>
      </header>

      <section class="chat-messages" id="chatMessages"></section>
      <button class="scroll-down-button" id="scrollDownButton" type="button" aria-label="Scroll to latest message">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2ZM12 17l6-6-1.41-1.41L13 13.17V4h-2v9.17L7.41 9.59 6 11l6 6Z" /></svg>
      </button>

      <footer class="chat-input-area" id="chatInputArea">
        <div class="status-line" id="statusLine"></div>
        <div class="chat-input-row">
          <textarea id="replyInput" rows="1" placeholder="Type your next reply..."></textarea>
          <button class="send-btn" id="sendButton">Send</button>
        </div>
      </footer>
    </main>

    <aside class="side-panel" id="sidePanel">
      <nav class="panel-rail" aria-label="Side panel sections">
        <button class="rail-button active" data-view="connections" aria-label="Connections"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h10v10H7z"/><path d="M4 12H2"/><path d="M22 12h-2"/><path d="M12 4V2"/><path d="M12 22v-2"/></svg></button>
        <button class="rail-button" data-view="presets" aria-label="Presets"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg></button>
        <button class="rail-button" data-view="characters" aria-label="Characters"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c2-6 14-6 16 0"/></svg></button>
        <button class="rail-button" data-view="personas" aria-label="Personas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10v7a5 5 0 0 1-10 0z"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M9 14c2 1 4 1 6 0"/></svg></button>
        <div class="rail-spacer"></div>
        <button class="rail-button" data-view="settings" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a7 7 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></svg></button>
      </nav>
      <div class="panel-main">
        <header class="panel-header">
          <div><div class="panel-title" id="panelTitle"></div><div class="panel-subtitle" id="panelSubtitle"></div></div>
          <div class="panel-actions" id="panelActions"></div>
        </header>
        <section class="panel-body" id="panelBody"></section>
      </div>
    </aside>`;
}

export function render() {
  applySettings();
  renderHeader();
  renderMessages();
  renderInputState();
  renderPanel();
  syncStatus();
}

export function renderHeader() {
  const path = activePath();
  const branches = branchBookmarks();
  document.getElementById('characterTitle').textContent = state.activeChat?.characterName || 'No chat';
  document.getElementById('chatMeta').textContent = state.activeChat
    ? `${state.activeChat.title} // ${path.length} messages // ${branches.length} branch${branches.length === 1 ? '' : 'es'}`
    : 'no active chat';

  const select = document.getElementById('chatSelect');
  select.innerHTML = state.chats.map(chat => `<option value="${chat.id}" ${chat.id === state.activeChat?.id ? 'selected' : ''}>${escapeHtml(chat.title)}</option>`).join('');

  if (!state.activeChat) return;
  document.getElementById('branchTreeMenu').innerHTML = `
    <div class="branch-tree-head">
      <div class="branch-tree-title">Branches</div>
    </div>
    ${branches.map(branch => `
      <div class="branch-row ${branch.id === state.activeChat.activeBranchId ? 'active' : ''}" data-branch-id="${branch.id}">
        <span>${escapeHtml(branchLabel(state.activeChat, branch))}</span>
        <span class="branch-inline-actions">
          <button class="branch-icon-button" data-action="rename-branch" data-branch-id="${branch.id}" title="Rename branch">${icons.edit}</button>
          <button class="branch-icon-button danger" data-action="delete-branch" data-branch-id="${branch.id}" title="Delete branch">${icons.delete}</button>
        </span>
      </div>`).join('')}`;
}

export function renderInputState() {
  const input = document.getElementById('replyInput');
  const button = document.getElementById('sendButton');
  const area = document.getElementById('chatInputArea');
  if (!input || !button || !area) return;

  input.disabled = state.generating;
  button.disabled = false;
  button.textContent = state.generating ? 'Stop' : 'Send';
  area.classList.toggle('generating', state.generating);
}

export function renderMessages() {
  const messages = document.getElementById('chatMessages');
  const path = activePath();
  const wasAtBottom = isAtMessageBottom();
  const shouldStick = state.autoScrollToBottom || wasAtBottom;
  const previousScrollTop = messages.scrollTop;

  if (!path.length) {
    messages.innerHTML = state.activeChat
      ? '<div class="empty-state"><strong>Fresh chat</strong>Write the first roleplay message below. System messages will only appear when explicitly added later.</div>'
      : '<div class="empty-state"><strong>No chat selected</strong>Create or import a chat to start roleplaying.</div>';
    updateScrollDownButton();
    return;
  }

  messages.innerHTML = path.map(node => renderMessage(node)).join('');
  if (shouldStick) scrollMessagesToBottom(false);
  else messages.scrollTop = previousScrollTop;
  updateScrollDownButton();
}

export function isAtMessageBottom() {
  const messages = document.getElementById('chatMessages');
  if (!messages) return true;
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 32;
}

export function scrollMessagesToBottom(smooth = true) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  messages.scrollTo({ top: messages.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  state.autoScrollToBottom = true;
  updateScrollDownButton();
}

export function updateScrollDownButton() {
  const button = document.getElementById('scrollDownButton');
  if (!button) return;
  const atBottom = isAtMessageBottom();
  button.classList.toggle('visible', !atBottom);
  if (atBottom) state.autoScrollToBottom = true;
}

function renderMessage(node) {
  const cssRole = node.role === 'assistant' ? 'ai' : node.role;
  const roleLabel = node.role === 'assistant' ? (state.activeChat.characterName || 'assistant') : node.role === 'user' ? (activePersona()?.name || 'you') : 'system';
  const portrait = portraitFor(node.role);
  const image = node.role === 'system' ? '<div class="msg-image hidden"></div>' : `<div class="msg-image"><img alt="${escapeHtml(roleLabel)} portrait" src="${portrait}" /></div>`;
  const reasoning = (node.reasoningBlocks || []).map(block => `
    <div class="reasoning-block ${block.collapsed ? 'collapsed' : ''}" data-reasoning-id="${block.id}">
      <button class="reasoning-toggle" data-action="toggle-reasoning" data-message-id="${node.id}" data-reasoning-id="${block.id}"><span>reasoning</span><span>${block.collapsed ? 'show' : 'hide'}</span></button>
      <div class="reasoning-text">${escapeHtml(block.content)}</div>
    </div>`).join('');
  const actions = node.role === 'system' || node.streaming ? '' : `
    <div class="message-action-tab">
      <button data-action="branch" data-message-id="${node.id}">branch</button>
      <button data-action="edit" data-message-id="${node.id}">edit</button>
      <button data-action="retry" data-message-id="${node.id}">retry</button>
      <button data-action="copy" data-message-id="${node.id}">copy</button>
      <button class="danger-text" data-action="delete-message" data-message-id="${node.id}" title="Delete message">${icons.delete}</button>
    </div>`;

  return `
    <article class="msg-card ${cssRole} ${node.streaming ? 'streaming' : ''}" data-message-id="${node.id}">
      ${image}
      <div class="msg-content">
        <div class="msg-head"><span class="msg-role ${node.role}">${escapeHtml(roleLabel)}</span><span class="msg-time">${new Date(node.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        ${reasoning}
        <div class="msg-text">${formatMessageContent(node.content)}</div>
      </div>
      ${actions}
    </article>`;
}

function portraitFor(role) {
  if (role === 'user') return activePersona()?.image || portraitSvg(role);
  if (role === 'assistant') {
    const character = state.characters.find(item => item.id === state.activeChat?.characterId) || state.characters.find(item => item.id === state.settings?.activeCharacterId);
    return character?.image || portraitSvg(role);
  }
  return portraitSvg(role);
}

function portraitSvg(role) {
  const fg = role === 'user' ? '888888' : '666666';
  const bg = role === 'user' ? '232323' : '1a1a1a';
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23${bg}'/%3E%3Ccircle cx='32' cy='24' r='10' fill='%23${fg}'/%3E%3Cpath d='M14 58c3-15 33-15 36 0' fill='%23555555'/%3E%3C/svg%3E`;
}
