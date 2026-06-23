export function createReasoningParser(settings, initial = {}) {
  const startTag = settings.reasoningStartTag || '<think>';
  const endTag = settings.reasoningEndTag || '</think>';
  const state = {
    visible: initial.visible || '',
    blocks: Array.isArray(initial.blocks) ? [...initial.blocks] : [],
    inReasoning: false,
    current: '',
    nativeReasoningBlockId: null
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

  function absorbReasoning(chunk) {
    if (!chunk) return snapshot();

    let block = state.nativeReasoningBlockId
      ? state.blocks.find(item => item.id === state.nativeReasoningBlockId)
      : null;

    if (!block) {
      block = {
        id: crypto.randomUUID(),
        content: '',
        collapsed: !settings.reasoningAlwaysExpanded
      };
      state.blocks.push(block);
      state.nativeReasoningBlockId = block.id;
    }

    block.content += chunk;
    return snapshot();
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

  return { absorb, absorbReasoning, finalize, snapshot };
}

export function formatMessageContent(text) {
  return decorateInline(String(text || ''));
}

function decorateInline(text) {
  let html = '';
  let buffer = '';
  let mode = null;

  const flush = () => {
    if (!buffer) return;
    const escaped = escapeHtml(buffer);
    if (mode === 'dialogue') html += `<span class="dialogue-text">${escaped}</span>`;
    else if (mode === 'action') html += `<span class="action-text">${escaped}</span>`;
    else html += escaped;
    buffer = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"' && mode !== 'action') {
      flush();
      if (mode === 'dialogue') {
        html += '<span class="dialogue-text">&quot;</span>';
        mode = null;
      } else {
        mode = 'dialogue';
        html += '<span class="dialogue-text">&quot;</span>';
      }
      continue;
    }

    if (char === '*' && mode !== 'dialogue') {
      flush();
      mode = mode === 'action' ? null : 'action';
      continue;
    }

    buffer += char;
  }

  flush();
  return html;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
