(() => {
  'use strict';

  if (globalThis.__DAISHI11_YT_EQ_CONFIG__) {
    return;
  }

  const BAND_FREQUENCIES = Object.freeze([
    125,
    250,
    500,
    1000,
    2000,
    4000,
    8000,
    16000
  ]);

  const DB_MIN = -12;
  const DB_MAX = 12;
  const PREAMP_MIN = -18;
  const PREAMP_MAX = 6;

  const freezePreset = (name, preamp, bass, bands) => Object.freeze({
    name,
    preamp,
    bass,
    bands: Object.freeze([...bands])
  });

  const BUILTIN_PRESETS = Object.freeze({
    flat: freezePreset('Flat', 0, 0, [0, 0, 0, 0, 0, 0, 0, 0]),
    heavy: freezePreset('Heavy / Punch', -4.5, 4, [2.5, 0, -1, -0.5, 0.5, 1.5, 1, 0]),
    rock: freezePreset('Rock', -3.5, 2.5, [1.5, -0.5, -1.5, 0, 1.5, 2, 1, 0]),
    deepBass: freezePreset('Deep Bass', -6, 6, [3, 1, -1.5, -1, 0, 0.5, 0.5, 0]),
    neighboursSubwoofer: freezePreset('Neighbour\'s Subwoofer', -6, 12, [12, 0, -9.5, -12, -12, -12, -12, -12])
  });

  const STORAGE_KEYS = Object.freeze({
    settings: 'settingsV1',
    userPresets: 'userPresetsV1'
  });

  const EVENT_NAMES = Object.freeze({
    command: '__daishi11_yteq_command_v1',
    status: '__daishi11_yteq_status_v1',
    ready: '__daishi11_yteq_ready_v1'
  });

  const SHADOW_STORAGE_KEY = '__daishi11_yteq_shadow_v1';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const finiteNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const presetToSettings = (presetId, enabled = true) => {
    const preset = BUILTIN_PRESETS[presetId] || BUILTIN_PRESETS.heavy;
    return {
      enabled: Boolean(enabled),
      preamp: preset.preamp,
      bass: preset.bass,
      bands: [...preset.bands],
      selectedPreset: presetId
    };
  };

  const defaultSettings = () => presetToSettings('heavy', true);

  const sanitizeSettings = raw => {
    const fallback = defaultSettings();
    const source = raw && typeof raw === 'object' ? raw : fallback;
    const sourceBands = Array.isArray(source.bands) ? source.bands : fallback.bands;

    return {
      enabled: source.enabled === undefined ? fallback.enabled : Boolean(source.enabled),
      preamp: clamp(finiteNumber(source.preamp, fallback.preamp), PREAMP_MIN, PREAMP_MAX),
      bass: clamp(finiteNumber(source.bass, fallback.bass), DB_MIN, DB_MAX),
      bands: BAND_FREQUENCIES.map((_, index) => clamp(
        finiteNumber(sourceBands[index], fallback.bands[index]),
        DB_MIN,
        DB_MAX
      )),
      selectedPreset: typeof source.selectedPreset === 'string'
        ? source.selectedPreset.slice(0, 128)
        : fallback.selectedPreset
    };
  };

  const sanitizePreset = raw => {
    const settings = sanitizeSettings({
      enabled: true,
      preamp: raw?.preamp,
      bass: raw?.bass,
      bands: raw?.bands,
      selectedPreset: 'custom'
    });

    return {
      preamp: settings.preamp,
      bass: settings.bass,
      bands: settings.bands
    };
  };

  const sanitizeUserPresets = raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const result = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!id.startsWith('user:') || !value || typeof value !== 'object') {
        continue;
      }

      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 48) : '';
      if (!name) {
        continue;
      }

      result[id.slice(0, 96)] = {
        name,
        preset: sanitizePreset(value.preset)
      };
    }

    return result;
  };

  globalThis.__DAISHI11_YT_EQ_CONFIG__ = Object.freeze({
    version: 1,
    bassFrequency: 80,
    bandQ: 1,
    BAND_FREQUENCIES,
    BUILTIN_PRESETS,
    STORAGE_KEYS,
    EVENT_NAMES,
    SHADOW_STORAGE_KEY,
    DB_MIN,
    DB_MAX,
    PREAMP_MIN,
    PREAMP_MAX,
    clamp,
    presetToSettings,
    defaultSettings,
    sanitizeSettings,
    sanitizePreset,
    sanitizeUserPresets
  });
})();
