'use strict';
/**
 * First-run asset downloads: Piper TTS Windows binary + curated voice models.
 * Mirrors the whisper-transcriber download.js pattern. Everything lives under
 * the app data dir passed by the caller (Electron userData in the app, a
 * local cache dir in tests).
 */
const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');

const PIPER_VERSION = '2023.11.14-2';
const PIPER_ZIP_URL = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_windows_amd64.zip`;

// Curated starter voices — all "medium" quality. Exact HuggingFace paths +
// expected sizes verified against rhasspy/piper-voices on 2026-07-06.
const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

const CATALOG = {
  'en_US-amy-medium': {
    id: 'en_US-amy-medium', name: 'Amy', lang: 'en_US', langLabel: 'English (US)',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/en/en_US/amy/medium/en_US-amy-medium.onnx`,
    jsonUrl: `${HF_BASE}/en/en_US/amy/medium/en_US-amy-medium.onnx.json`
  },
  'en_US-lessac-medium': {
    id: 'en_US-lessac-medium', name: 'Lessac', lang: 'en_US', langLabel: 'English (US)',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx`,
    jsonUrl: `${HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json`
  },
  'en_US-ryan-medium': {
    id: 'en_US-ryan-medium', name: 'Ryan', lang: 'en_US', langLabel: 'English (US)',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/en/en_US/ryan/medium/en_US-ryan-medium.onnx`,
    jsonUrl: `${HF_BASE}/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json`
  },
  'en_GB-alan-medium': {
    id: 'en_GB-alan-medium', name: 'Alan', lang: 'en_GB', langLabel: 'English (UK)',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/en/en_GB/alan/medium/en_GB-alan-medium.onnx`,
    jsonUrl: `${HF_BASE}/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json`
  },
  'en_GB-cori-medium': {
    id: 'en_GB-cori-medium', name: 'Cori', lang: 'en_GB', langLabel: 'English (UK)',
    quality: 'medium', sizeBytes: 63531379,
    onnxUrl: `${HF_BASE}/en/en_GB/cori/medium/en_GB-cori-medium.onnx`,
    jsonUrl: `${HF_BASE}/en/en_GB/cori/medium/en_GB-cori-medium.onnx.json`
  },
  'de_DE-thorsten-medium': {
    id: 'de_DE-thorsten-medium', name: 'Thorsten', lang: 'de_DE', langLabel: 'German',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx`,
    jsonUrl: `${HF_BASE}/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json`
  },
  'es_ES-davefx-medium': {
    id: 'es_ES-davefx-medium', name: 'Davefx', lang: 'es_ES', langLabel: 'Spanish',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx`,
    jsonUrl: `${HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json`
  },
  'fr_FR-siwis-medium': {
    id: 'fr_FR-siwis-medium', name: 'Siwis', lang: 'fr_FR', langLabel: 'French',
    quality: 'medium', sizeBytes: 63201294,
    onnxUrl: `${HF_BASE}/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx`,
    jsonUrl: `${HF_BASE}/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json`
  }
};

const DEFAULT_VOICE = 'en_US-amy-medium';

/** Stream a URL to disk with progress callbacks. Follows redirects (fetch does). */
async function downloadFile(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) {
        await new Promise((r) => out.once('drain', r));
      }
      if (onProgress) onProgress({ received, total });
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    fs.renameSync(tmp, dest);
  } catch (err) {
    out.destroy();
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

function findFileRecursive(dir, fileName) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, fileName);
      if (found) return found;
    } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function binDir(dataDir) {
  return path.join(dataDir, 'bin', 'piper', PIPER_VERSION);
}

/** Path to piper.exe if installed, else null. */
function piperExePath(dataDir) {
  return findFileRecursive(binDir(dataDir), 'piper.exe');
}

/** Path to the espeak-ng-data directory next to piper.exe, else null. */
function espeakDataPath(dataDir) {
  const exe = piperExePath(dataDir);
  if (!exe) return null;
  const dir = path.join(path.dirname(exe), 'espeak-ng-data');
  return fs.existsSync(dir) ? dir : null;
}

/** Download + extract the Piper Windows binary (whole zip, not just the exe). */
async function ensurePiper(dataDir, onProgress) {
  const existing = piperExePath(dataDir);
  if (existing && espeakDataPath(dataDir)) return existing;
  if (process.platform !== 'win32') {
    throw new Error('Automatic binary download is Windows-only. Build Piper and place piper.exe + espeak-ng-data in ' + binDir(dataDir));
  }
  const dir = binDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dataDir, 'piper-bin.zip.download');
  await downloadFile(PIPER_ZIP_URL, zipPath, (p) => onProgress && onProgress({ stage: 'binary', ...p }));
  await extractZip(zipPath, { dir });
  fs.unlinkSync(zipPath);
  const exe = piperExePath(dataDir);
  if (!exe) throw new Error('piper.exe not found inside downloaded archive');
  if (!espeakDataPath(dataDir)) throw new Error('espeak-ng-data folder not found next to piper.exe — phonemization would fail');
  return exe;
}

function voicesDir(dataDir) {
  return path.join(dataDir, 'voices');
}

/** Paths for a voice's .onnx / .onnx.json, or null components if not downloaded. */
function voicePaths(dataDir, voiceId) {
  if (!CATALOG[voiceId]) throw new Error('Unknown voice: ' + voiceId);
  const dir = voicesDir(dataDir);
  const onnxPath = path.join(dir, voiceId + '.onnx');
  const configPath = path.join(dir, voiceId + '.onnx.json');
  return {
    onnxPath: fs.existsSync(onnxPath) ? onnxPath : null,
    configPath: fs.existsSync(configPath) ? configPath : null
  };
}

function isVoiceInstalled(dataDir, voiceId) {
  const { onnxPath, configPath } = voicePaths(dataDir, voiceId);
  return !!(onnxPath && configPath);
}

/** List of installed voice ids with metadata merged from the catalog. */
function installedVoices(dataDir) {
  return Object.keys(CATALOG)
    .filter((id) => isVoiceInstalled(dataDir, id))
    .map((id) => ({ ...CATALOG[id] }));
}

/** Download a curated voice's .onnx + .onnx.json from Hugging Face if missing. */
async function ensureVoice(dataDir, voiceId, onProgress) {
  const entry = CATALOG[voiceId];
  if (!entry) throw new Error('Unknown voice: ' + voiceId);
  const dir = voicesDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const onnxPath = path.join(dir, voiceId + '.onnx');
  const configPath = path.join(dir, voiceId + '.onnx.json');

  if (!fs.existsSync(configPath)) {
    await downloadFile(entry.jsonUrl, configPath, (p) => onProgress && onProgress({ stage: 'voice-config', voice: voiceId, ...p }));
  }
  JSON.parse(fs.readFileSync(configPath, 'utf8')); // validate

  if (!fs.existsSync(onnxPath)) {
    await downloadFile(entry.onnxUrl, onnxPath, (p) => onProgress && onProgress({ stage: 'voice', voice: voiceId, ...p }));
  }
  return { onnxPath, configPath };
}

function removeVoice(dataDir, voiceId) {
  const { onnxPath, configPath } = voicePaths(dataDir, voiceId);
  if (onnxPath) fs.unlinkSync(onnxPath);
  if (configPath) fs.unlinkSync(configPath);
}

module.exports = {
  PIPER_VERSION,
  CATALOG,
  DEFAULT_VOICE,
  downloadFile,
  piperExePath,
  espeakDataPath,
  ensurePiper,
  voicesDir,
  voicePaths,
  isVoiceInstalled,
  installedVoices,
  ensureVoice,
  removeVoice
};
