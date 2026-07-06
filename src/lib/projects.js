'use strict';
/**
 * Project (document) persistence — one JSON file per project under
 * <dataDir>/projects/<id>.json. BOM-free JSON writes only (Node's
 * JSON.stringify + fs.writeFileSync never emit a BOM — PowerShell's
 * default UTF-16/BOM behavior is what we're avoiding, and we never
 * touch PowerShell for this).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Projects {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'projects');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  _file(id) {
    return path.join(this.dir, id + '.json');
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
          return { id: p.id, title: p.title, updatedAt: p.updatedAt, paragraphCount: (p.paragraphs || []).length };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  load(id) {
    const file = this._file(id);
    if (!fs.existsSync(file)) throw new Error('Project not found: ' + id);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  save(project) {
    const p = { ...project };
    if (!p.id) p.id = crypto.randomBytes(8).toString('hex');
    p.updatedAt = new Date().toISOString();
    if (!p.title) p.title = 'Untitled document';
    if (!p.defaults) p.defaults = { voice: null, speed: 1 };
    if (!p.paragraphs) p.paragraphs = [];
    fs.writeFileSync(this._file(p.id), JSON.stringify(p, null, 2));
    return p;
  }

  delete(id) {
    const file = this._file(id);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

module.exports = { Projects };
