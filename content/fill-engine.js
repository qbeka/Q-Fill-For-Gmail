/**
 * Verification code fill strategies and DOM value writers.
 * @module content/fill-engine
 */

import { CODE_VALIDATION } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import {
  collectInputs,
  isFillableInput
} from './dom.js';
import { calculateScore } from './scoring.js';
import { showSuccess, showToast } from './ui.js';

const { info } = createLogger(false);

function getInputValue(input) {
  if (input.getAttribute('contenteditable') === 'true') {
    return (input.textContent || '').replace(/\s/g, '');
  }
  return (input.value || '').replace(/\s/g, '');
}

function dispatchInputEvents(input, value) {
  try {
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    }));
  } catch {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function getNativeValueSetter(input) {
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, 'value')?.set;
}

function simulateTyping(input, text) {
  const nativeSetter = getNativeValueSetter(input);
  if (!nativeSetter) return false;

  input.focus();
  nativeSetter.call(input, '');

  for (const char of text) {
    nativeSetter.call(input, getInputValue(input) + char);
    dispatchInputEvents(input, char);
  }

  return getInputValue(input) === text;
}

function setValue(input, value) {
  const sanitized = String(value).replace(/[^a-zA-Z0-9]/g, '');
  if (!sanitized) return false;

  try {
    input.focus();
    if (input.select) input.select();

    if (input.getAttribute('contenteditable') === 'true') {
      input.textContent = sanitized;
      dispatchInputEvents(input, sanitized);
      return getInputValue(input) === sanitized;
    }

    const nativeSetter = getNativeValueSetter(input);
    if (nativeSetter) {
      nativeSetter.call(input, '');
      nativeSetter.call(input, sanitized);
    } else {
      input.value = sanitized;
    }

    input.setAttribute('value', sanitized);
    dispatchInputEvents(input, sanitized);

    if (getInputValue(input) === sanitized) return true;
    return simulateTyping(input, sanitized);
  } catch {
    return false;
  }
}

function setOTPDigit(input, char, isLast) {
  const ok = setValue(input, char);
  if (ok && !isLast) {
    const next = input.nextElementSibling;
    if (next?.tagName === 'INPUT' && next.maxLength === 1) next.focus();
  }
  return ok;
}

export function findBestInput(codeLength = 6) {
  let best = null;
  let bestScore = -Infinity;

  for (const input of collectInputs()) {
    if (!isFillableInput(input)) continue;
    const score = calculateScore(input, codeLength);
    if (score > bestScore) {
      bestScore = score;
      best = { input, score };
    }
  }

  return best?.score >= 40 ? best : null;
}

function findSingleCharInputs(codeLength) {
  return collectInputs().filter(input => {
    if (input.tagName !== 'INPUT' || !isFillableInput(input)) return false;
    const maxLen = input.maxLength;
    const size = input.size;
    const isSingle = maxLen === 1 || (size === 1 && (maxLen === -1 || maxLen === 1));
    return isSingle && calculateScore(input, codeLength) > -80;
  });
}

function clusterOTPInputs(inputs) {
  const clusters = new Map();
  for (const input of inputs) {
    const container = input.closest(
      '[class*="otp"], [class*="pin"], [class*="code"], [data-otp], [role="group"], form, fieldset'
    ) || input.parentElement?.parentElement || input.parentElement;
    if (!clusters.has(container)) clusters.set(container, []);
    clusters.get(container).push(input);
  }
  return [...clusters.values()];
}

function sortByVisualPosition(inputs) {
  return [...inputs].sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) < 20) return ra.left - rb.left;
    return ra.top - rb.top;
  });
}

function validateOTPRow(inputs) {
  if (inputs.length < 4 || inputs.length > 8) return null;
  const sorted = sortByVisualPosition(inputs);
  const firstTop = sorted[0].getBoundingClientRect().top;
  const aligned = sorted.filter(i => Math.abs(i.getBoundingClientRect().top - firstTop) < 30);
  if (aligned.length < 4) return null;

  for (let i = 1; i < aligned.length; i++) {
    const prev = aligned[i - 1].getBoundingClientRect();
    const curr = aligned[i].getBoundingClientRect();
    if (curr.left - prev.right > 100) return null;
  }
  return aligned;
}

export function findOTPGroup(codeLength = 6) {
  const singles = findSingleCharInputs(codeLength);
  if (singles.length < 4) return [];

  let bestGroup = [];
  let bestScore = -Infinity;

  for (const cluster of clusterOTPInputs(singles)) {
    const row = validateOTPRow(cluster);
    if (!row) continue;
    const avg = row.reduce((s, i) => s + calculateScore(i, codeLength), 0) / row.length;
    if (avg < 40) continue;
    const total = avg + (row.length === codeLength ? 25 : 0);
    if (total > bestScore) {
      bestScore = total;
      bestGroup = row;
    }
  }

  return bestGroup;
}

function scoreOTPGroup(inputs, codeLength) {
  const avg = inputs.reduce((s, i) => s + calculateScore(i, codeLength), 0) / inputs.length;
  return avg + (inputs.length >= 6 ? 30 : 15) + (inputs.length === codeLength ? 35 : 0);
}

function chooseFillStrategy(code) {
  const codeLength = code.length;
  const otpGroup = findOTPGroup(codeLength);
  const best = findBestInput(codeLength);
  const otpScore = otpGroup.length >= codeLength ? scoreOTPGroup(otpGroup, codeLength) : 0;
  const singleScore = best?.score || 0;

  if (best?.input?.autocomplete === 'one-time-code') {
    return { type: 'single', input: best.input, score: singleScore };
  }
  if (otpGroup.length >= codeLength && otpScore >= 70 && otpScore >= singleScore - 10) {
    return { type: 'otp', inputs: otpGroup.slice(0, codeLength) };
  }
  if (best && singleScore >= 40) {
    return { type: 'single', input: best.input, score: singleScore };
  }
  if (otpGroup.length >= codeLength && otpScore >= 50) {
    return { type: 'otp', inputs: otpGroup.slice(0, codeLength) };
  }
  return null;
}

/**
 * @param {string} code
 * @returns {{ success: boolean, message: string }}
 */
export function fillCode(code) {
  if (!code) return { success: false, message: 'No code provided' };

  const sanitized = String(code).replace(/[^a-zA-Z0-9]/g, '');
  const { MIN_LENGTH, MAX_LENGTH } = CODE_VALIDATION;

  if (sanitized.length < MIN_LENGTH || sanitized.length > MAX_LENGTH) {
    return { success: false, message: `Invalid code length: ${sanitized.length}` };
  }

  info(`Filling code (${sanitized.length} chars)`);
  const strategy = chooseFillStrategy(sanitized);

  if (!strategy) {
    return { success: false, message: 'No verification input found on this page' };
  }

  if (strategy.type === 'otp') {
    let filled = 0;
    const filledInputs = [];

    for (let i = 0; i < strategy.inputs.length; i++) {
      if (setOTPDigit(strategy.inputs[i], sanitized[i], i === strategy.inputs.length - 1)) {
        filled++;
        filledInputs.push(strategy.inputs[i]);
      }
    }

    if (filled === strategy.inputs.length) {
      strategy.inputs[strategy.inputs.length - 1].focus();
      showSuccess(filledInputs);
      showToast('toastFillSuccess', 'success');
      return { success: true, message: `Filled ${filled} OTP digits` };
    }

    return {
      success: false,
      message: `Only filled ${filled} of ${strategy.inputs.length} OTP fields`
    };
  }

  const filled = setValue(strategy.input, sanitized) || simulateTyping(strategy.input, sanitized);

  if (filled) {
    showSuccess([strategy.input]);
    showToast('toastFillSuccess', 'success');
    return { success: true, message: `Filled input (score: ${strategy.score})` };
  }

  return { success: false, message: 'Failed to set input value' };
}
