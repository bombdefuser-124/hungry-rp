import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const configPath = process.env.HUNGRY_RP_CONFIG || path.resolve(import.meta.dirname, 'config.yaml');
const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';

function stripYamlValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function readConfig(text) {
  const config = {};
  let section = null;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;

    const topLevel = rawLine.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (topLevel) {
      section = topLevel[1];
      config[section] = topLevel[2] ? stripYamlValue(topLevel[2]) : {};
      continue;
    }

    const nested = rawLine.match(/^\s{2}([A-Za-z_][\w-]*):\s*(.*)$/);
    if (nested && section && typeof config[section] === 'object') {
      config[section][nested[1]] = stripYamlValue(nested[2]);
    }
  }

  return config;
}

const appConfig = readConfig(configText);
const frontend = appConfig.frontend || {};
const frontendHost = frontend.host || undefined;
const frontendPort = Number(frontend.port) || undefined;
const proxyUrl = appConfig.proxy_url || '';

export default defineConfig({
  server: {
    host: frontendHost,
    port: frontendPort,
    strictPort: Boolean(frontendPort),
    proxy: proxyUrl ? {
      '/api': {
        target: proxyUrl,
        changeOrigin: true
      }
    } : undefined
  }
});
