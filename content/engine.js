(() => {
  'use strict';

  const ENGINE_KEY = '__DAISHI11_YT_EQ_ENGINE_V1__';
  if (window[ENGINE_KEY]) {
    window.dispatchEvent(new CustomEvent('__daishi11_yteq_ready_v1', {
      detail: JSON.stringify({ version: 1, reused: true })
    }));
    return;
  }

  const config = globalThis.__DAISHI11_YT_EQ_CONFIG__;
  if (!config) {
    return;
  }

  const state = {
    settings: config.defaultSettings(),
    context: null,
    records: new WeakMap(),
    lastError: null,
    statusTimer: null,
    scanTimer: null
  };

  window[ENGINE_KEY] = state;

  const parseJson = value => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const readShadowSettings = () => {
    try {
      const raw = localStorage.getItem(config.SHADOW_STORAGE_KEY);
      return raw ? config.sanitizeSettings(parseJson(raw)) : config.defaultSettings();
    } catch {
      return config.defaultSettings();
    }
  };

  const writeShadowSettings = settings => {
    try {
      localStorage.setItem(config.SHADOW_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Shadow storage is only a startup optimization. The extension store remains authoritative.
    }
  };

  state.settings = readShadowSettings();

  const dbToGain = db => 10 ** (db / 20);

  const smoothParam = (param, target, immediate = false) => {
    if (!state.context) {
      param.value = target;
      return;
    }

    const now = state.context.currentTime;
    param.cancelScheduledValues(now);

    if (immediate) {
      param.setValueAtTime(target, now);
      return;
    }

    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + 0.018);
  };

  const ensureContext = () => {
    if (state.context) {
      return state.context;
    }

    try {
      state.context = new AudioContext({ latencyHint: 'interactive' });
      state.context.addEventListener('statechange', () => queueStatus());
    } catch (error) {
      state.lastError = `AudioContext: ${error.message}`;
      queueStatus();
      return null;
    }

    return state.context;
  };

  const resumeContext = () => {
    const context = ensureContext();
    if (!context || context.state === 'running') {
      return;
    }

    context.resume().catch(error => {
      state.lastError = `Audio resume: ${error.message}`;
      queueStatus();
    });
  };

  const setRecordConnected = (record, connected) => {
    if (record.connectedToDestination === connected) {
      return;
    }

    try {
      if (connected) {
        record.dryGain.connect(state.context.destination);
        record.wetGain.connect(state.context.destination);
      } else {
        record.dryGain.disconnect(state.context.destination);
        record.wetGain.disconnect(state.context.destination);
      }
      record.connectedToDestination = connected;
    } catch (error) {
      state.lastError = `Graph connection: ${error.message}`;
    }
  };

  const applySettingsToRecord = (record, immediate = false) => {
    const settings = state.settings;

    smoothParam(record.preamp.gain, dbToGain(settings.preamp), immediate);
    smoothParam(record.bass.gain, settings.bass, immediate);

    for (let index = 0; index < record.bands.length; index += 1) {
      smoothParam(record.bands[index].gain, settings.bands[index], immediate);
    }

    smoothParam(record.dryGain.gain, settings.enabled ? 0 : 1, immediate);
    smoothParam(record.wetGain.gain, settings.enabled ? 1 : 0, immediate);
  };

  const createRecord = media => {
    const context = ensureContext();
    if (!context) {
      return null;
    }

    try {
      const source = context.createMediaElementSource(media);
      const dryGain = context.createGain();
      const preamp = context.createGain();
      const bass = context.createBiquadFilter();
      const bands = config.BAND_FREQUENCIES.map(frequency => {
        const filter = context.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = config.bandQ;
        return filter;
      });
      const wetGain = context.createGain();

      bass.type = 'lowshelf';
      bass.frequency.value = config.bassFrequency;

      source.connect(dryGain);
      source.connect(preamp);
      preamp.connect(bass);

      let previous = bass;
      for (const filter of bands) {
        previous.connect(filter);
        previous = filter;
      }
      previous.connect(wetGain);

      const record = {
        media,
        source,
        dryGain,
        preamp,
        bass,
        bands,
        wetGain,
        connectedToDestination: false,
        disconnectTimer: null
      };

      setRecordConnected(record, true);
      applySettingsToRecord(record, true);
      state.records.set(media, record);
      state.lastError = null;
      queueStatus();
      return record;
    } catch (error) {
      state.lastError = `Media hook: ${error.message}`;
      queueStatus();
      return null;
    }
  };

  const ensureAttached = media => {
    if (!(media instanceof HTMLMediaElement)) {
      return null;
    }

    let record = state.records.get(media);
    if (!record) {
      record = createRecord(media);
    } else {
      if (record.disconnectTimer !== null) {
        clearTimeout(record.disconnectTimer);
        record.disconnectTimer = null;
      }
      setRecordConnected(record, true);
    }

    return record;
  };

  const scheduleDisconnect = media => {
    const record = state.records.get(media);
    if (!record || record.disconnectTimer !== null) {
      return;
    }

    record.disconnectTimer = window.setTimeout(() => {
      record.disconnectTimer = null;
      if (!media.isConnected) {
        setRecordConnected(record, false);
        queueStatus();
      }
    }, 5000);
  };

  const scanNode = node => {
    if (!(node instanceof Element)) {
      return;
    }

    if (node.matches('audio, video')) {
      ensureAttached(node);
    }

    for (const media of node.querySelectorAll?.('audio, video') || []) {
      ensureAttached(media);
    }
  };

  const scanMedia = () => {
    for (const media of document.querySelectorAll('audio, video')) {
      ensureAttached(media);
    }
    queueStatus();
  };

  const applySettingsToDocument = (settings, immediate = false) => {
    state.settings = config.sanitizeSettings(settings);
    writeShadowSettings(state.settings);

    for (const media of document.querySelectorAll('audio, video')) {
      const record = ensureAttached(media);
      if (record) {
        applySettingsToRecord(record, immediate);
      }
    }

    if (state.settings.enabled) {
      resumeContext();
    }
    queueStatus();
  };

  const currentStatus = () => {
    const mediaElements = [...document.querySelectorAll('audio, video')];
    let attachedCount = 0;
    let playingCount = 0;

    for (const media of mediaElements) {
      const record = state.records.get(media);
      if (record?.connectedToDestination) {
        attachedCount += 1;
      }
      if (!media.paused && !media.ended && media.readyState > 1) {
        playingCount += 1;
      }
    }

    return {
      version: 1,
      site: location.hostname === 'music.youtube.com' ? 'YouTube Music' : 'YouTube',
      enabled: state.settings.enabled,
      attachedCount,
      playingCount,
      contextState: state.context?.state || 'not-created',
      lastError: state.lastError
    };
  };

  const emitStatus = () => {
    state.statusTimer = null;
    window.dispatchEvent(new CustomEvent(config.EVENT_NAMES.status, {
      detail: JSON.stringify(currentStatus())
    }));
  };

  function queueStatus() {
    if (state.statusTimer !== null) {
      return;
    }
    state.statusTimer = window.setTimeout(emitStatus, 30);
  }

  const onCommand = event => {
    const message = parseJson(event.detail);
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'apply-settings') {
      applySettingsToDocument(message.settings);
      return;
    }

    if (message.type === 'rescan') {
      scanMedia();
      return;
    }

    if (message.type === 'get-status') {
      emitStatus();
    }
  };

  const onMediaEvent = event => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement)) {
      return;
    }

    ensureAttached(media);
    if (event.type === 'play' || event.type === 'playing') {
      resumeContext();
    }
    queueStatus();
  };

  const onUserGesture = () => {
    if (!state.settings.enabled) {
      return;
    }

    resumeContext();
    scanMedia();
  };

  window.addEventListener(config.EVENT_NAMES.command, onCommand);
  document.addEventListener('play', onMediaEvent, true);
  document.addEventListener('playing', onMediaEvent, true);
  document.addEventListener('loadedmetadata', onMediaEvent, true);
  document.addEventListener('canplay', onMediaEvent, true);
  document.addEventListener('emptied', onMediaEvent, true);

  document.addEventListener('pointerdown', onUserGesture, true);
  document.addEventListener('keydown', onUserGesture, true);
  document.addEventListener('touchstart', onUserGesture, true);

  for (const eventName of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated']) {
    window.addEventListener(eventName, () => {
      scanMedia();
      queueMicrotask(scanMedia);
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        scanNode(node);
      }

      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        if (node.matches('audio, video')) {
          scheduleDisconnect(node);
        }
        for (const media of node.querySelectorAll?.('audio, video') || []) {
          scheduleDisconnect(media);
        }
      }
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true
  });

  scanMedia();
  state.scanTimer = window.setInterval(scanMedia, 1000);

  window.dispatchEvent(new CustomEvent(config.EVENT_NAMES.ready, {
    detail: JSON.stringify({ version: 1, reused: false })
  }));
  queueStatus();
})();
