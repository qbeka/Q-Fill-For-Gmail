/**
 * Extension popup — auth UI and check-email flow.
 * @module popup
 */

import { MESSAGE_ACTIONS } from './utils/constants.js';
import { t, tVersion } from './utils/i18n.js';

const CHECK_EMAILS_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:8px;vertical-align:text-bottom"><path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" fill="white"/></svg>';

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    statusIndicator: document.getElementById('statusIndicator'),
    connectionStatus: document.getElementById('connectionStatus'),
    errorMessage: document.getElementById('errorMessage'),
    successMessage: document.getElementById('successMessage'),
    connectButton: document.getElementById('connectButton'),
    disconnectButton: document.getElementById('disconnectButton'),
    checkEmailsButton: document.getElementById('checkEmailsButton'),
    visualizationContainer: document.getElementById('visualizationContainer'),
    scanEffect: document.getElementById('scanEffect'),
    codeParticle: document.getElementById('codeParticle'),
    formInput: document.getElementById('formInput'),
    loadingBar: document.getElementById('loadingBar'),
    statusText: document.getElementById('statusText')
  };

  let checkInProgress = false;
  let pendingResultTimeout = null;

  applyLocalizedStrings();
  bindEvents();
  listenForBackground();
  refreshAuthStatus();

  function applyLocalizedStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });

    const footer = document.querySelector('[data-i18n-version]');
    if (footer) {
      footer.textContent = tVersion('footerVersion', chrome.runtime.getManifest().version);
    }

    elements.connectButton.textContent = t('connectGmail');
    elements.disconnectButton.textContent = t('disconnect');
    resetCheckButtonLabel();
  }

  function resetCheckButtonLabel() {
    elements.checkEmailsButton.innerHTML = `${CHECK_EMAILS_SVG}${t('checkEmails')}`;
  }

  function bindEvents() {
    elements.connectButton.addEventListener('click', onConnect);
    elements.disconnectButton.addEventListener('click', onDisconnect);
    elements.checkEmailsButton.addEventListener('click', onCheckEmails);
  }

  function listenForBackground() {
    chrome.runtime.onMessage.addListener(message => {
      if (message.action === MESSAGE_ACTIONS.CHECKING_STATUS) {
        onCheckingStatus(message);
      }
    });
  }

  function onCheckingStatus(message) {
    if (!checkInProgress) return;

    if (pendingResultTimeout) {
      clearTimeout(pendingResultTimeout);
      pendingResultTimeout = null;
    }

    switch (message.status) {
      case 'checking':
        elements.statusText.textContent = t('vizSearching');
        animateLoadingBar(65);
        break;
      case 'noEmails':
        finishWithError(t('vizNoEmails'), t('noEmailsUser'));
        break;
      case 'codeFound':
        finishWithSuccess(message.code);
        break;
      case 'fillFailed':
        finishWithPartial(message.code, message.error || t('fillFailedDefault'));
        break;
      case 'noCodeFound':
        finishWithError(t('vizNoCode'), t('noCodeUser'));
        break;
      case 'error':
        finishWithError(t('vizError'), message.error || t('errorCheckFailed'));
        break;
    }
  }

  function finishCheck() {
    checkInProgress = false;
    setTimeout(() => {
      elements.checkEmailsButton.disabled = false;
      resetCheckButtonLabel();
    }, 2000);
  }

  function finishWithSuccess(code) {
    elements.statusText.textContent = t('vizCodeApplied');
    animateLoadingBar(100);
    runSuccessVisualization(code);
    showBanner('success', t('codeAppliedUser'));
    finishCheck();
  }

  function finishWithPartial(code, errorMessage) {
    elements.statusText.textContent = t('vizCodeFound');
    animateLoadingBar(100, true);
    if (code) elements.codeParticle.textContent = code;
    showErrorVisualization();
    showBanner('error', errorMessage);
    finishCheck();
  }

  function finishWithError(statusText, userMessage) {
    elements.statusText.textContent = statusText;
    animateLoadingBar(100, true);
    showErrorVisualization();
    showBanner('error', userMessage);
    finishCheck();
  }

  function runSuccessVisualization(code) {
    const display = code || '------';
    elements.codeParticle.textContent = display;
    elements.codeParticle.classList.remove('error');
    elements.codeParticle.style.opacity = '1';
    elements.codeParticle.style.animation = 'codeExtractAnimation 1.6s ease-in-out forwards';

    setTimeout(() => {
      elements.formInput.textContent = display;
      elements.formInput.classList.add('filled');
      elements.formInput.classList.remove('error');
      elements.formInput.style.animation = 'formPulseAnimation 0.5s ease-in-out';
    }, 1200);
  }

  function showErrorVisualization() {
    const emailContainer = document.querySelector('.email-container');
    const noCodeIcon = document.getElementById('noCodeIcon');
    const formInput = elements.formInput;

    elements.codeParticle.style.animation = 'none';
    void elements.codeParticle.offsetWidth;

    emailContainer?.classList.add('error');
    elements.scanEffect.classList.add('error');
    elements.codeParticle.classList.add('error');
    formInput.classList.add('error');
    elements.codeParticle.textContent = t('noCodeLabel');

    setTimeout(() => {
      if (emailContainer) {
        emailContainer.style.animation = 'emailErrorShake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
      }
      elements.scanEffect.style.animation = 'scanAnimation 2s ease-in-out';

      setTimeout(() => {
        elements.codeParticle.style.animation = 'codeNotFoundAnimation 2s ease-in-out forwards';
        setTimeout(() => {
          elements.codeParticle.style.opacity = '0';
          noCodeIcon?.classList.add('visible');
          formInput.style.animation = 'formShakeAnimation 0.5s ease-in-out';
        }, 1600);
      }, 600);
    }, 300);
  }

  async function onCheckEmails() {
    if (checkInProgress) return;

    try {
      checkInProgress = true;
      elements.checkEmailsButton.disabled = true;
      elements.checkEmailsButton.innerHTML =
        `${t('checking')} <span class="checking-animation pulse">⟳</span>`;

      hideBanners();
      elements.visualizationContainer.style.display = 'block';
      resetVisualization();

      const targetTabId = await getTargetTabId();
      elements.statusText.textContent = t('vizConnecting');
      animateLoadingBar(25);
      startScanAnimation();

      await sendMessage({
        action: MESSAGE_ACTIONS.FORCE_CHECK_EMAILS,
        tabId: targetTabId
      });

      elements.statusText.textContent = t('vizSearching');
      animateLoadingBar(45);

      pendingResultTimeout = setTimeout(() => {
        if (checkInProgress) {
          finishWithError(t('vizError'), t('errorTimeout'));
        }
      }, 30000);
    } catch {
      finishWithError(t('vizError'), t('errorCheckFailed'));
    }
  }

  function resetVisualization() {
    elements.scanEffect.style.animation = 'none';
    elements.codeParticle.style.animation = 'none';
    elements.formInput.classList.remove('filled', 'error');
    elements.formInput.textContent = t('formPlaceholder');
    elements.formInput.style.borderColor = '';
    elements.formInput.style.color = '';
    elements.loadingBar.style.width = '0%';
    elements.loadingBar.style.backgroundColor = 'var(--success-color)';
    elements.statusText.textContent = t('vizReady');

    document.querySelector('.email-container')?.classList.remove('error');
    elements.scanEffect.classList.remove('error');
    elements.codeParticle.classList.remove('error');
    elements.codeParticle.textContent = '123456';
    document.getElementById('noCodeIcon')?.classList.remove('visible');
  }

  function startScanAnimation() {
    elements.scanEffect.style.animation = 'scanAnimation 2s ease-in-out';
  }

  function animateLoadingBar(percent, isError = false) {
    elements.loadingBar.style.width = `${percent}%`;
    if (isError) elements.loadingBar.style.backgroundColor = 'var(--error-color)';
  }

  async function refreshAuthStatus() {
    try {
      const { isAuthenticated } = await sendMessage({ action: MESSAGE_ACTIONS.GET_AUTH_STATUS });
      setAuthUI(!!isAuthenticated);
    } catch {
      showBanner('error', t('errorAuthStatus'));
    }
  }

  function setAuthUI(isAuthenticated) {
    if (isAuthenticated) {
      elements.statusIndicator.textContent = t('statusConnected');
      elements.statusIndicator.classList.add('connected');
      elements.connectionStatus.textContent = t('connectionStatusConnected');
      elements.connectButton.classList.add('hidden');
      elements.disconnectButton.classList.remove('hidden');
      elements.checkEmailsButton.classList.remove('hidden');
    } else {
      elements.statusIndicator.textContent = t('statusDisconnected');
      elements.statusIndicator.classList.remove('connected');
      elements.connectionStatus.textContent = t('connectionStatusDisconnected');
      elements.connectButton.classList.remove('hidden');
      elements.disconnectButton.classList.add('hidden');
      elements.checkEmailsButton.classList.add('hidden');
      elements.visualizationContainer.style.display = 'none';
    }
  }

  async function onConnect() {
    hideBanners();
    elements.connectButton.disabled = true;
    elements.connectButton.innerHTML =
      `${t('connecting')} <span class="checking-animation pulse">⟳</span>`;

    try {
      const response = await sendMessage({ action: MESSAGE_ACTIONS.AUTHENTICATE });
      if (response?.success) {
        setAuthUI(true);
        showBanner('success', t('successConnected'));
      } else {
        showBanner('error', response?.error || t('errorAuthFailed'));
      }
    } catch {
      showBanner('error', t('errorConnectionFailed'));
    } finally {
      elements.connectButton.disabled = false;
      elements.connectButton.textContent = t('connectGmail');
    }
  }

  async function onDisconnect() {
    hideBanners();
    elements.disconnectButton.disabled = true;
    elements.disconnectButton.innerHTML =
      `${t('disconnecting')} <span class="checking-animation pulse">⟳</span>`;

    try {
      await sendMessage({ action: MESSAGE_ACTIONS.CLEAR_AUTH });
      setAuthUI(false);
      showBanner('success', t('successDisconnected'));
    } catch {
      setAuthUI(false);
      showBanner('success', t('successDisconnected'));
    } finally {
      elements.disconnectButton.disabled = false;
      elements.disconnectButton.textContent = t('disconnect');
    }
  }

  function showBanner(kind, text) {
    const box = kind === 'success' ? elements.successMessage : elements.errorMessage;
    const other = kind === 'success' ? elements.errorMessage : elements.successMessage;
    const span = box.querySelector('span');
    (span || box).textContent = text;
    box.classList.remove('hidden');
    other.classList.add('hidden');
    setTimeout(() => box.classList.add('hidden'), 5000);
  }

  function hideBanners() {
    elements.errorMessage.classList.add('hidden');
    elements.successMessage.classList.add('hidden');
  }

  function getTargetTabId() {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        resolve(tabs?.[0]?.id ?? null);
      });
    });
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  }
});
