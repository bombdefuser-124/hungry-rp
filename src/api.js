export const CONFIG_ENDPOINT = '/api/config';

function proxyUrl(settings, path) {
  const base = (settings.proxyUrl || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export async function fetchBackendConfig(configEndpoint = CONFIG_ENDPOINT) {
  const response = await fetch(configEndpoint);
  if (!response.ok) throw new Error(await response.text());

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Backend config endpoint did not return JSON. Restart the frontend so Vite loads config.yaml proxy settings.');
  }

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

export async function scanSillyTavern(settings, path) {
  const response = await fetch(proxyUrl(settings, '/api/sillytavern/scan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function importSillyTavern(settings, payload) {
  const response = await fetch(proxyUrl(settings, '/api/sillytavern/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
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
      const reasoning = delta.reasoning_content ?? delta.reasoning ?? '';
      const content = delta.content ?? '';
      if (reasoning) callbacks.onReasoningToken?.(reasoning);
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
