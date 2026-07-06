'use strict';
/**
 * WAV parsing/writing, silence generation, sample-rate-matched concatenation,
 * and MP3 export via ffmpeg-static. Piper's sample rate comes from each
 * voice's config JSON (see piper.js#readVoiceSampleRate) — mismatched rates
 * across paragraphs must be resampled before concatenation or the joined
 * audio pitches up/down ("chipmunk audio").
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function ffmpegPath() {
  // ffmpeg-static resolves to the platform binary inside node_modules.
  // In a packaged app the module lives in app.asar.unpacked (see package.json build config).
  const p = require('ffmpeg-static');
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.slice(-2000)}`));
    });
  });
}

/** Parse a canonical (or chunked) PCM WAV file header + locate the data chunk. */
function readWavInfo(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file: ' + filePath);
  }
  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        numChannels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bitsPerSample: buf.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt) throw new Error('WAV missing fmt chunk: ' + filePath);
  if (dataOffset < 0) throw new Error('WAV missing data chunk: ' + filePath);
  return { ...fmt, dataOffset, dataLength, buffer: buf };
}

/** Duration in seconds from a WAV's data length + byte rate. */
function wavDurationSec(filePath) {
  const info = readWavInfo(filePath);
  return info.dataLength / info.byteRate;
}

function writeWavHeader(dataLength, { sampleRate, numChannels, bitsPerSample }) {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/** Write a zero-sample (silent) PCM WAV file matching the given format. */
function writeSilenceWav(outPath, { sampleRate, numChannels = 1, bitsPerSample = 16, durationMs }) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const blockAlign = numChannels * (bitsPerSample / 8);
  const numSamples = Math.round((durationMs / 1000) * sampleRate);
  const dataLength = numSamples * blockAlign;
  const header = writeWavHeader(dataLength, { sampleRate, numChannels, bitsPerSample });
  const fd = fs.openSync(outPath, 'w');
  fs.writeSync(fd, header);
  if (dataLength > 0) {
    const zeroChunk = Buffer.alloc(Math.min(dataLength, 1024 * 1024));
    let remaining = dataLength;
    while (remaining > 0) {
      const n = Math.min(remaining, zeroChunk.length);
      fs.writeSync(fd, zeroChunk, 0, n);
      remaining -= n;
    }
  }
  fs.closeSync(fd);
  return outPath;
}

/** Resample/reformat a WAV to a target format via ffmpeg-static. */
async function resampleWav(inputPath, outputPath, { sampleRate, numChannels, bitsPerSample }) {
  const sampleFmt = bitsPerSample === 8 ? 'pcm_u8' : bitsPerSample === 24 ? 'pcm_s24le' : bitsPerSample === 32 ? 'pcm_s32le' : 'pcm_s16le';
  await run(ffmpegPath(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-ar', String(sampleRate),
    '-ac', String(numChannels),
    '-c:a', sampleFmt,
    outputPath
  ]);
  return outputPath;
}

/**
 * Concatenate a list of WAV files (in order) into a single WAV at outPath.
 * The output format matches the FIRST file; any file with a different
 * sample rate / channel count / bit depth is transparently resampled first.
 */
async function concatWavFiles(inputPaths, outPath, tmpDir) {
  if (inputPaths.length === 0) throw new Error('concatWavFiles: no inputs');
  const first = readWavInfo(inputPaths[0]);
  const target = { sampleRate: first.sampleRate, numChannels: first.numChannels, bitsPerSample: first.bitsPerSample };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (tmpDir) fs.mkdirSync(tmpDir, { recursive: true });

  const dataBuffers = [];
  let i = 0;
  for (const p of inputPaths) {
    let info = readWavInfo(p);
    if (info.sampleRate !== target.sampleRate || info.numChannels !== target.numChannels || info.bitsPerSample !== target.bitsPerSample) {
      const resampled = path.join(tmpDir || path.dirname(outPath), `__resample_${i++}.wav`);
      await resampleWav(p, resampled, target);
      info = readWavInfo(resampled);
    }
    dataBuffers.push(info.buffer.slice(info.dataOffset, info.dataOffset + info.dataLength));
  }
  const totalData = Buffer.concat(dataBuffers);
  const header = writeWavHeader(totalData.length, target);
  fs.writeFileSync(outPath, Buffer.concat([header, totalData]));
  return outPath;
}

/** Encode a WAV to MP3 via ffmpeg-static (libmp3lame). */
async function toMp3(wavPath, outPath, bitrateKbps = 192) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await run(ffmpegPath(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', wavPath,
    '-c:a', 'libmp3lame',
    '-b:a', `${bitrateKbps}k`,
    outPath
  ]);
  return outPath;
}

module.exports = {
  ffmpegPath,
  readWavInfo,
  wavDurationSec,
  writeSilenceWav,
  resampleWav,
  concatWavFiles,
  toMp3
};
