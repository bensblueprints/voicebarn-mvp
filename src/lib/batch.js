'use strict';
/**
 * Batch mode: turn a list of .txt files into one audio file per input,
 * using the document-default voice/speed. Blank line = paragraph break
 * (and implicit pause between paragraphs via pauseAfterMs).
 */
const fs = require('fs');
const path = require('path');

const { synthProject, exportProject } = require('./synth');

/** Split raw text into paragraphs on blank lines. */
function textToParagraphs(text, pauseAfterMs = 400) {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  if (blocks.length === 0) blocks.push(text.trim() || ' ');
  return blocks.map((b, i) => ({
    id: 'para-' + i,
    text: b,
    voice: null,
    speed: null,
    pauseAfterMs: i < blocks.length - 1 ? pauseAfterMs : 0
  }));
}

/**
 * @param {object} ctx synth context (see synth.js)
 * @param {string[]} files input .txt file paths
 * @param {{voice:string, speed:number, format:string, bitrate:number}} defaults
 * @param {string} outDir output folder — one file per input
 * @param {string} workRoot scratch dir for intermediate WAVs
 * @param {(p:object)=>void} [onProgress]
 * @returns {Promise<Array<{input:string, output:string}>>}
 */
async function runBatch(ctx, files, defaults, outDir, workRoot, onProgress) {
  fs.mkdirSync(outDir, { recursive: true });
  const format = defaults.format || 'wav';
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) onProgress({ fileIndex: i, totalFiles: files.length, file, phase: 'start' });
    const text = fs.readFileSync(file, 'utf8');
    const project = {
      title: path.basename(file, path.extname(file)),
      defaults: { voice: defaults.voice, speed: defaults.speed || 1 },
      paragraphs: textToParagraphs(text)
    };
    const base = path.basename(file, path.extname(file));
    const outPath = path.join(outDir, base + '.' + format);
    const workDir = path.join(workRoot, 'batch-' + i);
    // Rename the inner synth-level 'done' (fires once per file when its own
    // synth+encode finishes) to 'encoded' so it can't be confused with the
    // outer per-file 'done' event below, which is the only one carrying `output`.
    await exportProject(ctx, project, { format, bitrate: defaults.bitrate, outPath }, workDir,
      (p) => onProgress && onProgress({ fileIndex: i, totalFiles: files.length, file, phase: p.phase === 'done' ? 'encoded' : p.phase, sub: p }));
    fs.rmSync(workDir, { recursive: true, force: true });
    results.push({ input: file, output: outPath });
    if (onProgress) onProgress({ fileIndex: i, totalFiles: files.length, file, phase: 'done', output: outPath });
  }
  return results;
}

module.exports = { textToParagraphs, runBatch };
