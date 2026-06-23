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
