export function createReasoningParser(settings, initial = {}) {
  const startTag = settings.reasoningStartTag || '<think>';
  const endTag = settings.reasoningEndTag || '</think>';
  const state = {
    visible: initial.visible || '',
    blocks: Array.isArray(initial.blocks) ? [...initial.blocks] : [],
    inReasoning: false,
    current: ''
  };

  function finishReasoning() {
    state.blocks.push({
      id: crypto.randomUUID(),
      content: state.current,
      collapsed: !settings.reasoningAlwaysExpanded
    });
    state.current = '';
    state.inReasoning = false;
  }

  function absorb(chunk) {
    let rest = chunk;

    while (rest.length) {
      if (state.inReasoning) {
        const endIndex = rest.indexOf(endTag);
        if (endIndex === -1) {
          state.current += rest;
          rest = '';
        } else {
          state.current += rest.slice(0, endIndex);
          finishReasoning();
          rest = rest.slice(endIndex + endTag.length);
        }
        continue;
      }

      const startIndex = rest.indexOf(startTag);
      const endIndex = rest.indexOf(endTag);

      if (startIndex === -1 && endIndex === -1) {
        state.visible += rest;
        rest = '';
        continue;
      }

      if (startIndex !== -1 && (endIndex === -1 || startIndex < endIndex)) {
        state.visible += rest.slice(0, startIndex);
        state.inReasoning = true;
        state.current = '';
        rest = rest.slice(startIndex + startTag.length);
        continue;
      }

      if (endIndex !== -1) {
        const beforeEnd = rest.slice(0, endIndex);
        const reasoningContent = `${state.visible}${beforeEnd}`;
        state.visible = '';
        state.blocks.push({
          id: crypto.randomUUID(),
          content: reasoningContent,
          collapsed: !settings.reasoningAlwaysExpanded
        });
        rest = rest.slice(endIndex + endTag.length);
      }
    }

    return snapshot();
  }

  function finalize() {
    if (state.inReasoning) finishReasoning();
    return snapshot();
  }

  function snapshot() {
    return {
      visible: state.visible,
      reasoningBlocks: state.blocks.map(block => ({ ...block }))
    };
  }

  return { absorb, finalize, snapshot };
}

export function formatMessageContent(text) {
  const escaped = escapeHtml(text || '');
  return escaped
    .replace(/&quot;([^&]+?)&quot;/g, '<span class="dialogue-text">&quot;$1&quot;</span>')
    .replace(/\*([^*]+?)\*/g, '<span class="action-text">$1</span>');
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
