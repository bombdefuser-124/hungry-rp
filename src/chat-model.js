import { saveChat } from './db.js';
import { state } from './state.js';

export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createChat(title = 'New roleplay') {
  const branchId = newId('branch');
  return {
    id: newId('chat'),
    title,
    characterName: 'Kael the Wanderer',
    activeLeafId: null,
    activeBranchId: branchId,
    branchBookmarks: [{ id: branchId, name: 'main thread', leafId: null, createdAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: {}
  };
}

export function normalizeChat(chat) {
  if (!chat.branchBookmarks || !Array.isArray(chat.branchBookmarks) || chat.branchBookmarks.length === 0) {
    const branchId = newId('branch');
    chat.branchBookmarks = [{ id: branchId, name: 'main thread', leafId: chat.activeLeafId || null, createdAt: chat.createdAt || new Date().toISOString() }];
    chat.activeBranchId = branchId;
  }

  if (!Object.prototype.hasOwnProperty.call(chat, 'activeBranchId')) chat.activeBranchId = chat.branchBookmarks[0]?.id || null;
  if (!Object.prototype.hasOwnProperty.call(chat, 'activeLeafId')) chat.activeLeafId = activeBranch(chat)?.leafId || null;
  return chat;
}

export function getNode(chat, id) {
  return chat?.nodes?.[id] || null;
}

export function activeBranch(chat = state.activeChat) {
  if (!chat) return null;
  normalizeChat(chat);
  return chat.branchBookmarks.find(branch => branch.id === chat.activeBranchId) || chat.branchBookmarks[0] || null;
}

export function setActiveBranch(chat, branchId) {
  normalizeChat(chat);
  const branch = chat.branchBookmarks.find(item => item.id === branchId);
  if (!branch) return null;
  chat.activeBranchId = branch.id;
  chat.activeLeafId = branch.leafId || null;
  return branch;
}

export function setActiveLeaf(chat, leafId) {
  normalizeChat(chat);
  chat.activeLeafId = leafId || null;
  const branch = activeBranch(chat);
  if (branch) {
    if (branch.baseLeafId !== undefined && branch.baseLeafId !== chat.activeLeafId && !branch.firstNodeId) branch.firstNodeId = chat.activeLeafId;
    branch.leafId = chat.activeLeafId;
  }
}

export function activePath(chat = state.activeChat) {
  if (!chat) return [];
  normalizeChat(chat);
  const path = [];
  let node = getNode(chat, chat.activeLeafId);
  const seen = new Set();

  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.push(node);
    node = getNode(chat, node.parentId);
  }

  return path.reverse();
}

export function branchBookmarks(chat = state.activeChat) {
  if (!chat) return [];
  normalizeChat(chat);
  return [...chat.branchBookmarks].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function branchLabel(chat, branch) {
  if (branch.name) return branch.name;
  const leaf = getNode(chat, branch.leafId);
  if (!leaf) return 'main thread';
  return leaf.content.slice(0, 34).replace(/\s+/g, ' ') || leaf.role;
}

export function descendantIds(chat, rootId) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(chat.nodes)) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}

export async function persistActiveChat() {
  if (!state.activeChat) return;
  normalizeChat(state.activeChat);
  state.activeChat = await saveChat(state.activeChat);
  const index = state.chats.findIndex(chat => chat.id === state.activeChat.id);
  if (index === -1) state.chats.unshift(state.activeChat);
  else state.chats[index] = state.activeChat;
}
