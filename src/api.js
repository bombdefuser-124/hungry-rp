export const DEFAULT_PROXY_URL = 'http://localhost:8025';

function proxyUrl(settings, path) {
  const base = (settings.proxyUrl || DEFAULT_PROXY_URL).replace(/\/$/, '');
  return `${base}${path}`;
}

export async function fetchBackendConfig(proxyBase = DEFAULT_PROXY_URL) {
  const response = await fetch(`${proxyBase.replace(/\/$/, '')}/api/config`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function fetchModels(settings) {
  const response = await fetch(proxyUrl(settings, '/api/models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: settings.baseUrl, apiKey: settings.apiKey })
  });

  if (!response.ok) throw new Error(await response.text());
  const payload = await response.json();
  const models = Array.isArray(payload.data) ? payload.data : [];
  return models.map(model => model.id || model.name || String(model)).filter(Boolean).sort();
}

export async function streamChat(settings, messages, callbacks) {
  const controller = new AbortController();
  callbacks.onController?.(controller);
  const response = await fetch(proxyUrl(settings, '/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages,
      temperature: Number(settings.temperature),
      top_p: Number(settings.topP),
      max_tokens: Number(settings.maxOutput) > 0 ? Number(settings.maxOutput) : null
    })
  });

  if (!response.ok || !response.body) throw new Error(await response.text());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parseEvent = eventText => {
    const lines = eventText.split(/\r?\n/);
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');

    if (!data) return;
    if (event === 'error') {
      callbacks.onError?.(data);
      return;
    }
    if (data === '[DONE]') {
      callbacks.onDone?.();
      return;
    }

    try {
      const json = JSON.parse(data);
      const choice = json.choices?.[0];
      const delta = choice?.delta || {};
      const content = delta.content || delta.reasoning_content || delta.reasoning || '';
      if (content) callbacks.onToken?.(content);
      if (choice?.finish_reason) callbacks.onDone?.();
    } catch {
      callbacks.onToken?.(data);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const eventText of events) parseEvent(eventText);
    }

    if (buffer.trim()) parseEvent(buffer);
    callbacks.onDone?.();
  } catch (error) {
    if (error.name === 'AbortError') callbacks.onAbort?.();
    else callbacks.onError?.(error.message || String(error));
  }

  return controller;
}
