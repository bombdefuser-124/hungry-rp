export function renderTemplate(content, character = null, persona = null) {
  const characterName = character?.name || 'the character';
  const personaName = persona?.name || 'you';
  return String(content || '')
    .replace(/{{\s*char\s*}}/gi, characterName)
    .replace(/{{\s*user\s*}}/gi, personaName);
}
