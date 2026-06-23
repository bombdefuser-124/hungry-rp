const DB_NAME = 'hungry-rp';
const DB_VERSION = 1;

const STORES = ['settings', 'chats', 'presets', 'characters', 'personas'];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const defaultSettings = {
  id: 'global',
  proxyUrl: 'http://localhost:8025',
  baseUrl: 'http://localhost:5000/v1',
  apiKey: '',
  model: '',
  activeCharacterId: '',
  activePersonaId: '',
  activePresetId: '',
  models: [],
  temperature: 0.7,
  topP: 0.9,
  maxContext: 8192,
  maxOutput: -1,
  dialogueColor: '#22aa2b',
  actionColor: '#e8bd11',
  showImages: true,
  compactCards: true,
  alwaysShowActions: false,
  reasoningStartTag: '<think>',
  reasoningEndTag: '</think>',
  reasoningAlwaysExpanded: false
};

export async function getSettings() {
  const stored = await tx('settings', 'readonly', store => requestToPromise(store.get('global')));
  return { ...defaultSettings, ...(stored || {}) };
}

export async function saveSettings(settings) {
  const normalized = { ...defaultSettings, ...settings, id: 'global' };
  await tx('settings', 'readwrite', store => store.put(normalized));
  return normalized;
}

export async function getChats() {
  const chats = await tx('chats', 'readonly', store => requestToPromise(store.getAll()));
  return chats.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getChat(id) {
  return tx('chats', 'readonly', store => requestToPromise(store.get(id)));
}

export async function saveChat(chat) {
  const now = new Date().toISOString();
  const normalized = { ...chat, updatedAt: now, createdAt: chat.createdAt || now };
  await tx('chats', 'readwrite', store => store.put(normalized));
  return normalized;
}

export async function deleteChat(id) {
  await tx('chats', 'readwrite', store => store.delete(id));
}

export async function replaceAllChats(chats) {
  await tx('chats', 'readwrite', store => {
    store.clear();
    for (const chat of chats) store.put(chat);
  });
}

export async function getStoreItems(storeName) {
  return tx(storeName, 'readonly', store => requestToPromise(store.getAll()));
}

export async function saveStoreItem(storeName, item) {
  await tx(storeName, 'readwrite', store => store.put(item));
}

export async function deleteStoreItem(storeName, id) {
  await tx(storeName, 'readwrite', store => store.delete(id));
}
