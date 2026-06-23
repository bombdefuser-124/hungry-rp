import { streamChat } from './api.js';
import { deleteChat, getChats, saveChat } from './db.js';
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
import { openConfirmDialog, openTextDialog } from './dialog.js';
import { createReasoningParser } from './reasoning.js';
import { state } from './state.js';
import { setStatus } from './status.js';
import { render, renderMessages } from './ui.js';

export async function createNewChat() {
  state.activeChat = createChat(`Roleplay ${state.chats.length + 1}`);
  await persistActiveChat();
  state.autoScrollToBottom = true;
  setStatus(`Created ${state.activeChat.title}.`);
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
  if (!state.chats.length) {
    state.activeChat = createChat('Roleplay 1');
    await persistActiveChat();
  } else {
    state.activeChat = state.chats[0];
  }
  setStatus('Chat deleted.');
  render();
}

export function switchChat(id) {
  const chat = state.chats.find(item => item.id === id);
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
    name: 'you',
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
  return activePath().filter(node => node.id !== assistantId).map(node => ({
    role: node.role === 'assistant' ? 'assistant' : node.role,
    content: node.content
  }));
}

export async function generateAssistant() {
  if (!state.settings.model) {
    setStatus('Select a model first. Open Connections and connect to fetch models through the proxy.');
    return;
  }

  const assistant = {
    id: newId('msg'),
    parentId: state.activeChat.activeLeafId,
    role: 'assistant',
    name: state.activeChat.characterName || 'assistant',
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
    assistant.content = snapshot.visible;
    assistant.reasoningBlocks = snapshot.reasoningBlocks;
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
      onToken: token => {
        const snapshot = parser.absorb(token);
        assistant.content = snapshot.visible;
        assistant.reasoningBlocks = snapshot.reasoningBlocks;
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
  const text = await file.text();
  const payload = JSON.parse(text);
  const chat = payload.chat || payload;
  if (!chat.nodes || !Object.prototype.hasOwnProperty.call(chat, 'activeLeafId')) throw new Error('Invalid chat export');
  chat.id = chat.id || newId('chat');
  chat.title = chat.title || file.name.replace(/\.json$/i, '');
  state.activeChat = await saveChat(chat);
  state.chats = await getChats();
  state.autoScrollToBottom = true;
  render();
  event.target.value = '';
}

export function exportActiveChat() {
  if (!state.activeChat) return;
  const blob = new Blob([JSON.stringify({ version: 1, chat: state.activeChat }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.activeChat.title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function nodeById(id) {
  return getNode(state.activeChat, id);
}

export function currentBranch() {
  return activeBranch(state.activeChat);
}
