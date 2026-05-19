/**
 * In-page UI feedback (toasts and highlight).
 * @module content/ui
 */

import { t } from '../utils/i18n.js';

/**
 * @param {HTMLElement[]} inputs
 */
export function showSuccess(inputs) {
  const bg = 'rgba(16, 185, 129, 0.25)';
  const border = 'rgb(16, 185, 129)';

  inputs.forEach(input => {
    const original = {
      backgroundColor: input.style.backgroundColor,
      borderColor: input.style.borderColor,
      boxShadow: input.style.boxShadow,
      outline: input.style.outline,
      transition: input.style.transition
    };

    input.style.transition = 'all 0.2s ease-out';
    input.style.backgroundColor = bg;
    input.style.borderColor = border;
    input.style.boxShadow = `0 0 0 3px ${bg}`;
    input.style.outline = `2px solid ${border}`;

    setTimeout(() => {
      Object.assign(input.style, original);
    }, 1800);
  });
}

/**
 * @param {string} messageOrKey - i18n key (toast*) or plain text
 * @param {'success'|'error'|'info'} type
 */
export function showToast(messageOrKey, type = 'info') {
  document.getElementById('qfill-toast')?.remove();

  const colors = { success: '#10B981', error: '#EF4444', info: '#6366F1' };
  const icons = { success: '\u2713', error: '\u2717', info: '\u2139' };

  const toast = document.createElement('div');
  toast.id = 'qfill-toast';
  toast.style.cssText = `
    position: fixed !important;
    bottom: 24px !important;
    right: 24px !important;
    background: ${colors[type] || colors.info} !important;
    color: white !important;
    padding: 14px 20px !important;
    border-radius: 8px !important;
    font-family: system-ui, sans-serif !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    box-shadow: 0 4px 14px rgba(0,0,0,0.2) !important;
    z-index: 2147483647 !important;
  `;
  const label = messageOrKey.startsWith('toast') ? t(messageOrKey) : messageOrKey;
  toast.textContent = `${icons[type] || icons.info} ${label}`;

  if (!document.getElementById('qfill-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'qfill-toast-styles';
    style.textContent = `
      @keyframes qfill-toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      @keyframes qfill-toast-out { to { opacity:0; transform:translateY(-8px); } }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
