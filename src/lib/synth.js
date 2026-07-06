'use strict';
/**
 * High-level synthesis orchestration: paragraph -> WAV (handling per-paragraph
 * voice/speed + SSML-lite pause tokens) and project -> final WAV/MP3 export.
 * Decoupled from Electron and from the download layer via a small `ctx`:
 *   ctx.piperExe          path to piper.exe
 *   ctx.espeakDataDir     path to espeak-ng-data
 *   ctx.getVoicePaths(id) -> { onnxPath, configPath }  (must already exist)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { synthText, readVoiceSampleRate } = require('./piper');
const { parsePauseTokens } = require('./ssml');
const { writeSilenceWav, concatWavFiles, toMp3, wavDurationSec } = require('./audio');

/**
 * UI speed is an intuitive playback multiplier (0.5x = slower/half speed,
 * 2.0x = faster/double speed). Piper's --length_scale is the inverse:
 * larger length_scale = longer phonemes = slower speech. So length_scale
 * = 1 / speed. This mapping is the ONLY thing translating the UI's
 * "0.5x-2.0x" slider into the flag Piper actually understands.
 */
function speedToLengthScale(speed) {
  const s = Number(speed) || 1;
  return Math.round((1 / s) * 1000) / 1000;
}

function hashKey(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 20);
}

async function synthTextChunk(ctx, { voiceId, text, speed }, outPath) {
  const { onnxPath, configPath } = ctx.getVoicePaths(voiceId);
  if (!onnxPath || !configPath) throw new Error('Voice not installed: ' + voiceId);
  await synthText({
    piperExe: ctx.piperExe,
    espeakDataDir: ctx.espeakDataDir,
    onnxPath,
    configPath,
    text,
    lengthScale: speedToLengthScale(speed),
    outPath
  });
  return outPath;
}

/**
 * Synthesize one paragraph (text + voice + speed + pause tokens + pauseAfterMs)
 * to a single WAV file inside workDir. Resolves defaults from the document.
 */
async function synthParagraph(ctx, paragraph, defaults, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const voiceId = paragraph.voice || defaults.voice;
  const speed = paragraph.speed || defaults.speed || 1;
  if (!voiceId) throw new Error('No voice specified (paragraph nor document default)');
  const { configPath } = ctx.getVoicePaths(voiceId);
  if (!configPath) throw new Error('Voice not installed: ' + voiceId);
  const sampleRate = readVoiceSampleRate(configPath);

  const chunks = parsePauseTokens(paragraph.text || '');
  const partPaths = [];
  let idx = 0;
  for (const chunk of chunks) {
    if (chunk.type === 'text') {
      const p = path.join(workDir, `chunk_${idx++}.wav`);
      await synthTextChunk(ctx, { voiceId, text: chunk.value, speed }, p);
      partPaths.push(p);
    } else {
      const p = path.join(workDir, `pause_${idx++}.wav`);
      writeSilenceWav(p, { sampleRate, durationMs: chunk.ms });
      partPaths.push(p);
    }
  }
  if (partPaths.length === 0) {
    const p = path.join(workDir, `empty_${idx++}.wav`);
    writeSilenceWav(p, { sampleRate, durationMs: 30 });
    partPaths.push(p);
  }
  if (paragraph.pauseAfterMs) {
    const p = path.join(workDir, `pauseafter_${idx++}.wav`);
    writeSilenceWav(p, { sampleRate, durationMs: paragraph.pauseAfterMs });
    partPaths.push(p);
  }
  const outPath = path.join(workDir, 'paragraph.wav');
  await concatWavFiles(partPaths, outPath, workDir);
  return outPath;
}

/** Synthesize + cache a single paragraph preview, keyed by hash(text+voice+speed). */
async function previewParagraph(ctx, paragraph, defaults, cacheDir) {
  const voiceId = paragraph.voice || defaults.voice;
  const speed = paragraph.speed || defaults.speed || 1;
  const key = hashKey(JSON.stringify({ text: paragraph.text, voiceId, speed, pauseAfterMs: paragraph.pauseAfterMs || 0 }));
  const cached = path.join(cacheDir, key + '.wav');
  if (fs.existsSync(cached)) return cached;
  const workDir = path.join(cacheDir, '_work_' + key);
  const wav = await synthParagraph(ctx, paragraph, defaults, workDir);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.copyFileSync(wav, cached);
  fs.rmSync(workDir, { recursive: true, force: true });
  return cached;
}

/** Synthesize every paragraph of a project and concatenate into one WAV. */
async function synthProject(ctx, project, workDir, onProgress) {
  const paragraphs = project.paragraphs || [];
  if (paragraphs.length === 0) throw new Error('Project has no paragraphs');
  const defaults = project.defaults || {};
  const paragraphWavs = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const pdir = path.join(workDir, 'p' + i);
    if (onProgress) onProgress({ index: i, total: paragraphs.length, phase: 'synth' });
    const wav = await synthParagraph(ctx, paragraphs[i], defaults, pdir);
    paragraphWavs.push(wav);
  }
  if (onProgress) onProgress({ index: paragraphs.length, total: paragraphs.length, phase: 'join' });
  const finalPath = path.join(workDir, 'final.wav');
  await concatWavFiles(paragraphWavs, finalPath, workDir);
  return finalPath;
}

/** Full export: synth project -> join -> optional MP3 encode -> outPath. */
async function exportProject(ctx, project, opts, workDir, onProgress) {
  const { format = 'wav', bitrate = 192, outPath } = opts;
  const wav = await synthProject(ctx, project, workDir, onProgress);
  if (onProgress) onProgress({ phase: 'encode', format });
  if (format === 'mp3') {
    await toMp3(wav, outPath, bitrate);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(wav, outPath);
  }
  if (onProgress) onProgress({ phase: 'done' });
  return outPath;
}

module.exports = {
  speedToLengthScale,
  synthTextChunk,
  synthParagraph,
  previewParagraph,
  synthProject,
  exportProject,
  wavDurationSec
};
