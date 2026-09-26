(() => {
  'use strict';

  const config = globalThis.__DAISHI11_YT_EQ_CONFIG__;
  if (!config) {
    return;
  }

  const elements = {
    enabled: document.querySelector('#enabled'),
    statusDot: document.querySelector('#status-dot'),
    statusTitle: document.querySelector('#status-title'),
    statusDetail: document.querySelector('#status-detail'),
    rescan: document.querySelector('#rescan'),
    preamp: document.querySelector('#preamp'),
    preampValue: document.querySelector('#preamp-value'),
    bass: document.querySelector('#bass'),
    bassValue: document.querySelector('#bass-value'),
    bands: document.querySelector('#bands'),
    preset: document.querySelector('#preset'),
    savePreset: document.querySelector('#save-preset'),
    deletePreset: document.querySelector('#delete-preset'),
    saveModal: document.querySelector('#save-modal'),
    presetName: document.querySelector('#preset-name'),
    cancelSave: document.querySelector('#cancel-save'),
    confirmSave: document.querySelector('#confirm-save')
  };

  let settings = config.defaultSettings();
  let userPresets = {};
  let activeTabId = null;
  let bridgeAvailable = false;
  let persistTimer = null;
  const bandInputs = [];
  const bandOutputs = [];

  const formatFrequency = frequency => frequency >= 1000
    ? `${frequency / 1000}k`
    : `${frequency}`;

  const formatDb = value => {
    const number = Number(value);
    const prefix = number > 0 ? '+' : '';
    return `${prefix}${number.toFixed(1)} dB`;
  };

  const currentAcousticPreset = () => ({
    preamp: settings.preamp,
    bass: settings.bass,
    bands: [...settings.bands]
  });

  const presetsEqual = (left, right) => {
    if (!left || !right) {
      return false;
    }

    if (Math.abs(left.preamp - right.preamp) > 0.001 || Math.abs(left.bass - right.bass) > 0.001) {
      return false;
    }

    return config.BAND_FREQUENCIES.every((_, index) => (
      Math.abs(left.bands[index] - right.bands[index]) <= 0.001
    ));
  };

  const detectPresetId = () => {
    const current = currentAcousticPreset();

    for (const [id, preset] of Object.entries(config.BUILTIN_PRESETS)) {
      if (presetsEqual(current, preset)) {
        return id;
      }
    }

    for (const [id, entry] of Object.entries(userPresets)) {
      if (presetsEqual(current, entry.preset)) {
        return id;
      }
    }

    return 'custom';
  };

  const updatePresetSelection = () => {
    const detected = detectPresetId();
    settings.selectedPreset = detected;

    const existing = [...elements.preset.options].some(option => option.value === detected);
    elements.preset.value = existing ? detected : 'custom';
    elements.deletePreset.disabled = !elements.preset.value.startsWith('user:');
  };

  const renderSettings = () => {
    elements.enabled.checked = settings.enabled;
    elements.preamp.value = settings.preamp;
    elements.preampValue.value = formatDb(settings.preamp);
    elements.bass.value = settings.bass;
    elements.bassValue.value = formatDb(settings.bass);

    for (let index = 0; index < bandInputs.length; index += 1) {
      bandInputs[index].value = settings.bands[index];
      bandOutputs[index].value = formatDb(settings.bands[index]).replace(' dB', '');
    }

    updatePresetSelection();
  };

  const setStatus = status => {
    elements.statusDot.className = 'status-dot';

    if (!bridgeAvailable) {
      elements.statusTitle.textContent = 'Open YouTube or YouTube Music';
      elements.statusDetail.textContent = 'Settings are saved and will apply on the next supported tab.';
      return;
    }

    if (!status) {
      elements.statusDot.classList.add('waiting');
      elements.statusTitle.textContent = 'EQ engine ready';
      elements.statusDetail.textContent = 'Waiting for player status…';
      return;
    }

    if (status.lastError) {
      elements.statusDot.classList.add('error');
      elements.statusTitle.textContent = `${status.site} · audio hook error`;
      elements.statusDetail.textContent = status.lastError;
      return;
    }

    if (!settings.enabled) {
      elements.statusTitle.textContent = `${status.site} · bypassed`;
      elements.statusDetail.textContent = `${status.attachedCount} media source${status.attachedCount === 1 ? '' : 's'} hooked.`;
      return;
    }

    if (status.attachedCount === 0) {
      elements.statusDot.classList.add('waiting');
      elements.statusTitle.textContent = `${status.site} · waiting for player`;
      elements.statusDetail.textContent = 'Mutation observer and 1 s fallback scan are armed.';
      return;
    }

    if (status.contextState !== 'running' && status.playingCount > 0) {
      elements.statusDot.classList.add('waiting');
      elements.statusTitle.textContent = `${status.site} · Web Audio suspended`;
      elements.statusDetail.textContent = 'Click the page once so Firefox can resume the audio context.';
      return;
    }

    elements.statusDot.classList.add('active');
    elements.statusTitle.textContent = `${status.site} · EQ active`;
    elements.statusDetail.textContent = `${status.attachedCount} source${status.attachedCount === 1 ? '' : 's'} hooked · ${status.contextState}`;
  };

  const sendToActiveTab = async (persist = false) => {
    if (activeTabId === null) {
      return;
    }

    try {
      await browser.tabs.sendMessage(activeTabId, {
        type: 'YTEQ_APPLY_SETTINGS',
        settings,
        persist
      });
      bridgeAvailable = true;
    } catch {
      bridgeAvailable = false;
      setStatus(null);
    }
  };

  const persistSettings = async () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    settings = config.sanitizeSettings(settings);
    await browser.storage.local.set({
      [config.STORAGE_KEYS.settings]: settings
    });
  };

  const schedulePersist = () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
    }

    persistTimer = window.setTimeout(() => {
      persistSettings().catch(() => {});
    }, 120);
  };

  const applyLive = () => {
    settings = config.sanitizeSettings(settings);
    renderSettings();
    sendToActiveTab(false).catch(() => {});
    schedulePersist();
  };

  const applyPreset = (preset, id) => {
    const sanitized = config.sanitizePreset(preset);
    settings = config.sanitizeSettings({
      ...settings,
      ...sanitized,
      selectedPreset: id
    });
    renderSettings();
    sendToActiveTab(false).catch(() => {});
    persistSettings().catch(() => {});
  };

  const populatePresets = () => {
    elements.preset.replaceChildren();

    for (const [id, preset] of Object.entries(config.BUILTIN_PRESETS)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = preset.name;
      elements.preset.append(option);
    }

    if (Object.keys(userPresets).length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'Saved';
      for (const [id, entry] of Object.entries(userPresets)) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = entry.name;
        group.append(option);
      }
      elements.preset.append(group);
    }

    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom';
    custom.disabled = true;
    elements.preset.append(custom);
  };

  const createBandControls = () => {
    for (let index = 0; index < config.BAND_FREQUENCIES.length; index += 1) {
      const frequency = config.BAND_FREQUENCIES[index];
      const band = document.createElement('label');
      band.className = 'band';

      const output = document.createElement('output');
      output.className = 'band-value';

      const sliderWrap = document.createElement('span');
      sliderWrap.className = 'band-slider-wrap';

      const input = document.createElement('input');
      input.type = 'range';
      input.min = config.DB_MIN;
      input.max = config.DB_MAX;
      input.step = '0.5';
      input.dataset.index = `${index}`;
      input.setAttribute('aria-label', `${formatFrequency(frequency)} Hz`);
      sliderWrap.append(input);

      const label = document.createElement('span');
      label.className = 'band-label';
      label.textContent = formatFrequency(frequency);

      band.append(output, sliderWrap, label);
      elements.bands.append(band);
      bandInputs.push(input);
      bandOutputs.push(output);
    }
  };

  const resetRange = input => {
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const addRangeConveniences = input => {
    input.addEventListener('dblclick', event => {
      event.preventDefault();
      resetRange(input);
    });

    input.addEventListener('wheel', event => {
      event.preventDefault();
      const step = Number(input.step) || 0.5;
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = config.clamp(
        Number(input.value) + direction * step,
        Number(input.min),
        Number(input.max)
      );
      input.value = `${next}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, { passive: false });
  };

  const openSaveModal = () => {
    elements.presetName.value = '';
    elements.saveModal.hidden = false;
    window.setTimeout(() => elements.presetName.focus(), 0);
  };

  const closeSaveModal = () => {
    elements.saveModal.hidden = true;
  };

  const saveCurrentPreset = async () => {
    const name = elements.presetName.value.trim().slice(0, 48);
    if (!name) {
      elements.presetName.focus();
      return;
    }

    const id = `user:${Date.now()}`;
    userPresets[id] = {
      name,
      preset: currentAcousticPreset()
    };
    userPresets = config.sanitizeUserPresets(userPresets);

    await browser.storage.local.set({
      [config.STORAGE_KEYS.userPresets]: userPresets
    });

    populatePresets();
    settings.selectedPreset = id;
    elements.preset.value = id;
    elements.deletePreset.disabled = false;
    await persistSettings();
    closeSaveModal();
  };

  const deleteSelectedPreset = async () => {
    const id = elements.preset.value;
    if (!id.startsWith('user:') || !userPresets[id]) {
      return;
    }

    delete userPresets[id];
    await browser.storage.local.set({
      [config.STORAGE_KEYS.userPresets]: userPresets
    });
    populatePresets();
    updatePresetSelection();
  };

  const initialize = async () => {
    createBandControls();
    addRangeConveniences(elements.preamp);
    addRangeConveniences(elements.bass);
    for (const input of bandInputs) {
      addRangeConveniences(input);
    }

    const stored = await browser.storage.local.get([
      config.STORAGE_KEYS.settings,
      config.STORAGE_KEYS.userPresets
    ]);

    settings = config.sanitizeSettings(stored[config.STORAGE_KEYS.settings]);
    userPresets = config.sanitizeUserPresets(stored[config.STORAGE_KEYS.userPresets]);
    populatePresets();
    renderSettings();

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tabs[0]?.id ?? null;

    if (activeTabId !== null) {
      try {
        const response = await browser.tabs.sendMessage(activeTabId, {
          type: 'YTEQ_GET_STATE'
        });
        bridgeAvailable = true;
        if (response?.settings) {
          settings = config.sanitizeSettings(response.settings);
          renderSettings();
        }
        setStatus(response?.status || null);
      } catch {
        bridgeAvailable = false;
        setStatus(null);
      }
    } else {
      setStatus(null);
    }
  };

  elements.enabled.addEventListener('change', () => {
    settings.enabled = elements.enabled.checked;
    renderSettings();
    sendToActiveTab(true).catch(() => {});
    persistSettings().catch(() => {});
  });

  elements.preamp.addEventListener('input', () => {
    settings.preamp = Number(elements.preamp.value);
    applyLive();
  });

  elements.preamp.addEventListener('change', () => {
    persistSettings().catch(() => {});
  });

  elements.bass.addEventListener('input', () => {
    settings.bass = Number(elements.bass.value);
    applyLive();
  });

  elements.bass.addEventListener('change', () => {
    persistSettings().catch(() => {});
  });

  elements.bands.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') {
      return;
    }

    const index = Number(input.dataset.index);
    settings.bands[index] = Number(input.value);
    applyLive();
  });

  elements.bands.addEventListener('change', () => {
    persistSettings().catch(() => {});
  });

  elements.preset.addEventListener('change', () => {
    const id = elements.preset.value;
    if (config.BUILTIN_PRESETS[id]) {
      applyPreset(config.BUILTIN_PRESETS[id], id);
      return;
    }

    if (userPresets[id]) {
      applyPreset(userPresets[id].preset, id);
    }
  });

  elements.savePreset.addEventListener('click', openSaveModal);
  elements.cancelSave.addEventListener('click', closeSaveModal);
  elements.confirmSave.addEventListener('click', () => {
    saveCurrentPreset().catch(() => {});
  });

  elements.presetName.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      saveCurrentPreset().catch(() => {});
    } else if (event.key === 'Escape') {
      closeSaveModal();
    }
  });

  elements.saveModal.addEventListener('click', event => {
    if (event.target === elements.saveModal) {
      closeSaveModal();
    }
  });

  elements.deletePreset.addEventListener('click', () => {
    deleteSelectedPreset().catch(() => {});
  });

  elements.rescan.addEventListener('click', async () => {
    if (activeTabId === null) {
      return;
    }

    try {
      await browser.tabs.sendMessage(activeTabId, { type: 'YTEQ_RESCAN' });
      bridgeAvailable = true;
    } catch {
      bridgeAvailable = false;
      setStatus(null);
    }
  });

  browser.runtime.onMessage.addListener(message => {
    if (message?.type === 'YTEQ_STATUS') {
      bridgeAvailable = true;
      setStatus(message.status);
    }
  });

  window.addEventListener('unload', () => {
    if (persistTimer !== null) {
      browser.storage.local.set({
        [config.STORAGE_KEYS.settings]: config.sanitizeSettings(settings)
      }).catch(() => {});
    }
  });

  initialize().catch(error => {
    elements.statusDot.className = 'status-dot error';
    elements.statusTitle.textContent = 'Popup error';
    elements.statusDetail.textContent = error.message;
  });
})();
