/**
 * DOM traversal and field discovery (including shadow roots).
 * @module content/dom
 */

import { SKIP_TYPES } from '../utils/input-keywords.js';

export function textIncludesKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s_\\-.])${escaped}(?:[\\s_\\-.]|$)`, 'i').test(text);
}

export function isVisible(el) {
  if (!el) return false;

  let current = el;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      current.hidden
    ) {
      return false;
    }
    current = current.parentElement;
  }

  const rect = el.getBoundingClientRect();
  return rect.width >= 5 && rect.height >= 5;
}

export function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  const margin = 100;
  return (
    rect.top >= -margin &&
    rect.left >= -margin &&
    rect.bottom <= window.innerHeight + margin &&
    rect.right <= window.innerWidth + margin
  );
}

export function isInModal(el) {
  const selectors = [
    '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
    '.modal', '.popup', '.overlay', '.dialog', '.lightbox',
    '[class*="modal"]', '[class*="popup"]', '[class*="dialog"]',
    '[id*="modal"]', '[id*="popup"]', '[id*="dialog"]'
  ];
  return selectors.some(s => el.closest(s));
}

function* walkRoots(root) {
  yield root;
  const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of elements) {
    if (el.shadowRoot) yield* walkRoots(el.shadowRoot);
  }
}

export function collectInputs() {
  const seen = new Set();
  const inputs = [];

  for (const root of walkRoots(document)) {
    const nodes = root.querySelectorAll(
      'input, textarea, [contenteditable="true"], [role="textbox"]'
    );
    for (const node of nodes) {
      if (!seen.has(node)) {
        seen.add(node);
        inputs.push(node);
      }
    }
  }

  return inputs;
}

export function isInteractable(el) {
  if (el.disabled || el.readOnly) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const tabIndex = el.getAttribute('tabindex');
  if (tabIndex === '-1' && document.activeElement !== el) return false;
  return window.getComputedStyle(el).pointerEvents !== 'none';
}

export function isFillableInput(input) {
  if (input.tagName === 'INPUT') {
    const type = (input.type || 'text').toLowerCase();
    if (SKIP_TYPES.has(type)) return false;
  }
  return isInteractable(input) && isVisible(input);
}

export function getAttributeText(el) {
  const parts = [];
  const attrs = [
    'id', 'name', 'class', 'placeholder', 'title',
    'aria-label', 'data-testid', 'data-cy', 'data-test',
    'autocomplete', 'inputmode', 'pattern'
  ];

  for (const attr of attrs) {
    const val = el.getAttribute(attr);
    if (val) parts.push(val);
  }

  return parts.join(' ').toLowerCase().replace(/[-_]/g, ' ');
}

export function getContextText(input) {
  const parts = [];

  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) parts.push(label.textContent);
  }

  const parentLabel = input.closest('label');
  if (parentLabel) parts.push(parentLabel.textContent);

  for (const attr of ['aria-labelledby', 'aria-describedby']) {
    const ids = input.getAttribute(attr);
    if (!ids) continue;
    ids.split(' ').forEach(id => {
      const el = document.getElementById(id);
      if (el) parts.push(el.textContent);
    });
  }

  let parent = input.parentElement;
  for (let level = 0; level < 3 && parent; level++) {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent);
    }
    parent.querySelectorAll(
      ':scope > label, :scope > span, :scope > p, :scope > small, :scope > strong, :scope > div > label'
    ).forEach(el => {
      if (!el.contains(input)) parts.push(el.textContent);
    });
    parent = parent.parentElement;
  }

  const sibling = input.previousElementSibling;
  if (sibling && ['LABEL', 'SPAN', 'P', 'DIV'].includes(sibling.tagName)) {
    parts.push(sibling.textContent);
  }

  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}
