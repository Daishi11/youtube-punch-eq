(() => {
  'use strict';

  const BRIDGE_KEY = '__DAISHI11_YT_EQ_BRIDGE_V1__';
  if (globalThis[BRIDGE_KEY]) {
    return;
  }
  globalThis[BRIDGE_KEY] = true;

  const config = globalThis.__DAISHI11_YT_EQ_CONFIG__;
  if (!config) {
    return;
  }

  let settings = config.defaultSettings();
  let status = null;

  const sendEngineCommand = payload => {
    window.dispatchEvent(new CustomEvent(config.EVENT_NAMES.command, {
      detail: JSON.stringify(payload)
    }));
  };

  const applyToEngine = () => {
    sendEngineCommand({
      type: 'apply-settings',
      settings
    });
  };

  const loadSettings = async () => {
    const stored = await browser.storage.local.get(config.STORAGE_KEYS.settings);
    const raw = stored[config.STORAGE_KEYS.settings];
    settings = config.sanitizeSettings(raw);

    if (!raw) {
      await browser.storage.local.set({
        [config.STORAGE_KEYS.settings]: settings
      });
    }

    applyToEngine();
  };

  const parseEventDetail = detail => {
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  };

  window.addEventListener(config.EVENT_NAMES.ready, () => {
    applyToEngine();
    sendEngineCommand({ type: 'get-status' });
  });

  window.addEventListener(config.EVENT_NAMES.status, event => {
    status = parseEventDetail(event.detail);
    browser.runtime.sendMessage({
      type: 'YTEQ_STATUS',
      status
    }).catch(() => {});
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[config.STORAGE_KEYS.settings]) {
      return;
    }

    settings = config.sanitizeSettings(changes[config.STORAGE_KEYS.settings].newValue);
    applyToEngine();
  });

  browser.runtime.onMessage.addListener(message => {
    if (!message || typeof message !== 'object') {
      return undefined;
    }

    if (message.type === 'YTEQ_GET_STATE') {
      sendEngineCommand({ type: 'get-status' });
      return Promise.resolve({
        settings,
        status
      });
    }

    if (message.type === 'YTEQ_APPLY_SETTINGS') {
      settings = config.sanitizeSettings(message.settings);
      applyToEngine();

      if (message.persist) {
        return browser.storage.local.set({
          [config.STORAGE_KEYS.settings]: settings
        }).then(() => ({ ok: true }));
      }

      return Promise.resolve({ ok: true });
    }

    if (message.type === 'YTEQ_RESCAN') {
      sendEngineCommand({ type: 'rescan' });
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });

  loadSettings().catch(error => {
    console.error('[YouTube Punch EQ] Failed to load settings.', error);
  });
})();
