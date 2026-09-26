'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'config.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);

const config = context.__DAISHI11_YT_EQ_CONFIG__;
assert(config, 'Config global should exist.');
assert.strictEqual(config.BAND_FREQUENCIES.length, 8);
assert.strictEqual(config.defaultSettings().selectedPreset, 'heavy');
assert.strictEqual(config.defaultSettings().enabled, true);

const clamped = config.sanitizeSettings({
  enabled: true,
  preamp: 500,
  bass: -500,
  bands: [100, -100, 1, 2, 3, 4, 5, 6],
  selectedPreset: 'x'.repeat(500)
});

assert.strictEqual(clamped.preamp, 6);
assert.strictEqual(clamped.bass, -12);
assert.strictEqual(clamped.bands[0], 12);
assert.strictEqual(clamped.bands[1], -12);
assert.strictEqual(clamped.selectedPreset.length, 128);

const userPresets = config.sanitizeUserPresets({
  'user:1': {
    name: ' Test ',
    preset: {
      preamp: -3,
      bass: 4,
      bands: [1, 2, 3, 4, 5, 6, 7, 8]
    }
  },
  invalid: {
    name: 'Ignore me',
    preset: {}
  }
});

assert.strictEqual(userPresets['user:1'].name, 'Test');
assert.strictEqual(userPresets.invalid, undefined);

console.log('config.test.js: OK');
