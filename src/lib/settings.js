'use strict';
/** Tiny JSON store for app settings: <dataDir>/settings.json */
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  defaultVoice: null,
  defaultSpeed: 1,
  exportFormat: 'wav',
  mp3Bitrate: 192,
  outDir: null
};

class Settings {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'settings.json');
  }

  get() {
    try {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  set(partial) {
    const merged = { ...this.get(), ...partial };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(merged, null, 2));
    return merged;
  }
}

module.exports = { Settings, DEFAULTS };
