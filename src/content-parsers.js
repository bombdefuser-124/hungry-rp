import { newId } from './chat-model.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function parseCharacterFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.json') || file.type === 'application/json') {
    return normalizeCharacterCard(JSON.parse(await file.text()), file.name, null);
  }
  if (lower.endsWith('.png') || lower.endsWith('.apng') || file.type === 'image/png') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks = readPngTextChunks(bytes);
    const encoded = chunks.ccv3 || chunks.chara;
    if (!encoded) throw new Error('PNG does not contain a ccv3 or chara text chunk.');
    const json = JSON.parse(base64Utf8ToString(encoded));
    const image = await fileToDataUrl(file);
    return normalizeCharacterCard(json, file.name, image);
  }
  throw new Error('Unsupported character file. Use .json, .png, or .apng.');
}

export function normalizeCharacterCard(card, sourceName = 'character card', image = null) {
  const data = card?.data || card;
  if (!data || typeof data !== 'object') throw new Error('Invalid character card.');
  if (!data.name && !card.name) throw new Error('Character card is missing a name.');

  const character = {
    id: newId('char'),
    name: String(data.name || card.name || sourceName.replace(/\.[^.]+$/, '')).trim(),
    description: data.description || card.description || '',
    personality: data.personality || card.personality || '',
    scenario: data.scenario || card.scenario || '',
    firstMessage: data.first_mes || card.first_mes || '',
    messageExample: data.mes_example || card.mes_example || '',
    creatorNotes: data.creator_notes || card.creatorcomment || card.creator_notes || '',
    systemPrompt: data.system_prompt || '',
    postHistoryInstructions: data.post_history_instructions || '',
    tags: Array.isArray(data.tags) ? data.tags : Array.isArray(card.tags) ? card.tags : [],
    image: image || imageFromCard(data, card),
    sourceFormat: card.spec || 'json',
    sourceName,
    raw: card,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return character;
}

export function characterToCard(character) {
  const data = {
    name: character.name || 'Unnamed character',
    description: character.description || '',
    personality: character.personality || '',
    scenario: character.scenario || '',
    first_mes: character.firstMessage || '',
    mes_example: character.messageExample || '',
    creator_notes: character.creatorNotes || '',
    system_prompt: character.systemPrompt || '',
    post_history_instructions: character.postHistoryInstructions || '',
    tags: character.tags || [],
    creator: '',
    character_version: '1.0.0',
    alternate_greetings: [],
    extensions: {}
  };

  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data,
    name: data.name,
    description: data.description,
    personality: data.personality,
    first_mes: data.first_mes,
    avatar: 'none',
    mes_example: data.mes_example,
    scenario: data.scenario,
    tags: data.tags
  };
}

export function parsePresetFilePayload(payload, sourceName = 'preset') {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid preset JSON.');
  const prompts = Array.isArray(payload.prompts) ? payload.prompts : [];
  if (!prompts.length) throw new Error('Preset does not contain a prompts array.');

  return {
    id: newId('preset'),
    name: payload.name || sourceName.replace(/\.json$/i, '') || 'Imported preset',
    sourceName,
    prompts: prompts.map((prompt, index) => normalizePromptBlock(prompt, index)),
    settings: extractPresetSettings(payload),
    raw: payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function presetToExport(preset) {
  return {
    name: preset.name,
    prompts: (preset.prompts || []).map(prompt => ({
      identifier: prompt.identifier,
      name: prompt.name,
      system_prompt: false,
      marker: false,
      role: prompt.role || 'system',
      content: prompt.content || '',
      enabled: prompt.enabled !== false,
      injection_position: prompt.injectionPosition ?? 0,
      injection_depth: prompt.injectionDepth ?? 4,
      injection_order: prompt.injectionOrder ?? 100,
      injection_trigger: prompt.injectionTrigger || [],
      forbid_overrides: false
    }))
  };
}

export function createCharacterFromForm(form) {
  return {
    id: newId('char'),
    name: form.name || 'Unnamed character',
    description: form.description || '',
    personality: form.personality || '',
    scenario: form.scenario || '',
    firstMessage: form.firstMessage || '',
    messageExample: form.messageExample || '',
    creatorNotes: '',
    systemPrompt: form.systemPrompt || '',
    postHistoryInstructions: '',
    tags: [],
    image: form.image || null,
    sourceFormat: 'created',
    sourceName: 'created in app',
    raw: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createPersonaFromForm(form) {
  return {
    id: newId('persona'),
    name: form.name || 'Unnamed persona',
    description: form.description || '',
    image: form.image || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizePromptBlock(prompt, index) {
  const content = prompt.content || '';
  return {
    id: prompt.id || newId('prompt'),
    identifier: prompt.identifier || `prompt_${index + 1}`,
    name: prompt.name || prompt.identifier || `Prompt ${index + 1}`,
    role: prompt.role || 'system',
    content,
    enabled: prompt.enabled !== false,
    expanded: false,
    injectionPosition: prompt.injection_position ?? 0,
    injectionDepth: prompt.injection_depth ?? 4,
    injectionOrder: prompt.injection_order ?? 100,
    injectionTrigger: prompt.injection_trigger || [],
    meta: parsePromptMeta(content)
  };
}

function parsePromptMeta(content) {
  const meta = {};
  const pattern = /\{\{\/\/\s*@([\w-]+)\s*([^}]*)\}\}/g;
  let match;
  while ((match = pattern.exec(content))) {
    meta[match[1]] = match[2].trim() || true;
  }
  return meta;
}

function extractPresetSettings(payload) {
  const keys = ['temperature', 'top_p', 'top_k', 'min_p', 'frequency_penalty', 'presence_penalty', 'openai_max_tokens', 'openai_max_context'];
  return Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(payload, key)).map(key => [key, payload[key]]));
}

function readPngTextChunks(bytes) {
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('Invalid PNG/APNG file.');
  const chunks = {};
  const decoder = new TextDecoder('latin1');
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;

    if (type === 'tEXt') {
      const data = bytes.slice(dataStart, dataEnd);
      const nullIndex = data.indexOf(0);
      if (nullIndex > -1) {
        const key = decoder.decode(data.slice(0, nullIndex));
        const value = decoder.decode(data.slice(nullIndex + 1));
        chunks[key] = value;
      }
    }

    offset = dataEnd + 4;
  }

  return chunks;
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function base64Utf8ToString(base64) {
  const binary = atob(base64.trim());
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function imageFromCard(data, card) {
  const avatar = data.avatar || card.avatar;
  if (typeof avatar === 'string' && avatar.startsWith('data:image/')) return avatar;
  return null;
}
