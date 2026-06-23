export const state = {
  settings: null,
  chats: [],
  characters: [],
  personas: [],
  presets: [],
  activeChat: null,
  activeView: 'connections',
  panelMode: null,
  status: '',
  generating: false,
  generationController: null,
  autoScrollToBottom: true
};

export function activeCharacter() {
  return state.characters.find(character => character.id === state.settings?.activeCharacterId) || state.characters[0] || null;
}

export function activePersona() {
  return state.personas.find(persona => persona.id === state.settings?.activePersonaId) || state.personas[0] || null;
}

export function activePreset() {
  return state.presets.find(preset => preset.id === state.settings?.activePresetId) || state.presets[0] || null;
}
