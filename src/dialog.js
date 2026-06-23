import { escapeHtml } from './reasoning.js';

let activeDialog = null;

export function openTextDialog({ title, label, value = '', confirmText = 'Save', multiline = false }) {
  closeDialog();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'inline-dialog-overlay';
    overlay.innerHTML = `
      <div class="inline-dialog" role="dialog" aria-modal="true" aria-labelledby="inlineDialogTitle">
        <div class="inline-dialog-head">
          <div class="inline-dialog-title" id="inlineDialogTitle">${escapeHtml(title)}</div>
          <button class="inline-dialog-close" type="button" data-dialog-cancel aria-label="Close">x</button>
        </div>
        <label class="inline-dialog-label" for="inlineDialogInput">${escapeHtml(label)}</label>
        ${multiline
          ? `<textarea id="inlineDialogInput" class="inline-dialog-input" rows="8">${escapeHtml(value)}</textarea>`
          : `<input id="inlineDialogInput" class="inline-dialog-input" value="${escapeHtml(value)}" />`}
        <div class="inline-dialog-actions">
          <button class="small-action" type="button" data-dialog-cancel>Cancel</button>
          <button class="send-btn" type="button" data-dialog-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;

    const input = overlay.querySelector('#inlineDialogInput');
    mountDialog(overlay, resolve, () => input.value, multiline);
    input.focus();
    input.select();
  });
}

export function openSillyTavernImportDialog(scan) {
  closeDialog();

  return new Promise(resolve => {
    const users = scan.users || [];
    const first = users[0] || { name: '', characters: [], personas: [], presets: [] };
    const overlay = document.createElement('div');
    overlay.className = 'inline-dialog-overlay';
    overlay.innerHTML = `
      <div class="inline-dialog wide-dialog" role="dialog" aria-modal="true" aria-labelledby="inlineDialogTitle">
        <div class="inline-dialog-head">
          <div class="inline-dialog-title" id="inlineDialogTitle">Import from SillyTavern</div>
          <button class="inline-dialog-close" type="button" data-dialog-cancel aria-label="Close">x</button>
        </div>
        <div class="inline-dialog-message">Select exactly what should be imported from userdata.</div>
        <label class="inline-dialog-label" for="sillyUserSelect">Userdata folder</label>
        <select id="sillyUserSelect" class="inline-dialog-input">
          ${users.map(user => `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`).join('') || '<option value="">No profiles found</option>'}
        </select>
        <div class="import-option-list item-import-list" id="sillyImportOptions"></div>
        <div class="inline-dialog-actions">
          <button class="small-action" type="button" data-dialog-cancel>Cancel</button>
          <button class="send-btn" type="button" data-dialog-confirm ${users.length ? '' : 'disabled'}>Import selected</button>
        </div>
      </div>`;

    const select = overlay.querySelector('#sillyUserSelect');
    const options = overlay.querySelector('#sillyImportOptions');
    const renderGroup = (title, key, items) => `
      <div class="import-group">
        <div class="import-group-title">
          <label><input type="checkbox" class="import-group-toggle" data-group="${key}" checked /> ${title} (${items.length})</label>
        </div>
        <div class="import-items">
          ${items.length ? items.map(item => `
            <label class="import-option item-option">
              <input type="checkbox" data-import-kind="${key}" value="${escapeHtml(item.id)}" checked />
              <span>${escapeHtml(item.label || item.id)}</span>
              <small>${escapeHtml(item.path || item.id)}</small>
            </label>`).join('') : '<div class="import-empty">Nothing found.</div>'}
        </div>
      </div>`;
    const renderOptions = () => {
      const user = users.find(item => item.name === select.value) || first;
      options.innerHTML = [
        renderGroup('Characters', 'characters', user.characters || []),
        renderGroup('Personas', 'personas', user.personas || []),
        renderGroup('Presets', 'presets', user.presets || [])
      ].join('');
      options.querySelectorAll('.import-group-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
          options.querySelectorAll(`[data-import-kind="${toggle.dataset.group}"]`).forEach(input => { input.checked = toggle.checked; });
        });
      });
    };
    renderOptions();
    select.addEventListener('change', renderOptions);

    const selected = kind => [...overlay.querySelectorAll(`[data-import-kind="${kind}"]:checked`)].map(input => input.value);
    mountDialog(overlay, resolve, () => ({
      user: select.value,
      characters: selected('characters'),
      personas: selected('personas'),
      presets: selected('presets')
    }), false);
    select.focus();
  });
}

export function openConfirmDialog({ title, message, confirmText = 'Delete' }) {
  closeDialog();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'inline-dialog-overlay';
    overlay.innerHTML = `
      <div class="inline-dialog" role="dialog" aria-modal="true" aria-labelledby="inlineDialogTitle">
        <div class="inline-dialog-head">
          <div class="inline-dialog-title" id="inlineDialogTitle">${escapeHtml(title)}</div>
          <button class="inline-dialog-close" type="button" data-dialog-cancel aria-label="Close">x</button>
        </div>
        <div class="inline-dialog-message">${escapeHtml(message)}</div>
        <div class="inline-dialog-actions">
          <button class="small-action" type="button" data-dialog-cancel>Cancel</button>
          <button class="send-btn danger-action" type="button" data-dialog-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;

    mountDialog(overlay, resolve, () => true, false);
    overlay.querySelector('[data-dialog-confirm]').focus();
  });
}

function mountDialog(overlay, resolve, getValue, multiline) {
  const settle = result => {
    closeDialog();
    resolve(result);
  };

  activeDialog = { overlay };
  document.body.appendChild(overlay);

  overlay.addEventListener('click', event => {
    if (event.target === overlay || event.target.closest('[data-dialog-cancel]')) settle(null);
    if (event.target.closest('[data-dialog-confirm]')) settle(getValue());
  });

  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      settle(null);
    }
    if (!multiline && event.key === 'Enter') {
      event.preventDefault();
      settle(getValue());
    }
    if (multiline && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      settle(getValue());
    }
  });
}

function closeDialog() {
  if (!activeDialog) return;
  activeDialog.overlay.remove();
  activeDialog = null;
}
