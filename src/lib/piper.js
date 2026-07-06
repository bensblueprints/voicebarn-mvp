'use strict';
/**
 * Spawn piper.exe to synthesize a single line of text to a WAV file.
 * Piper reads text from stdin (one line = one utterance) and writes the
 * chosen --output_file. The espeak-ng-data directory must be passed
 * explicitly or phonemization fails silently (see plan risks).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Read a voice's config JSON and return its sample rate (defaults to 22050). */
function readVoiceSampleRate(configPath) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return (cfg.audio && cfg.audio.sample_rate) || 22050;
}

/**
 * @param {object} opts
 * @param {string} opts.piperExe
 * @param {string} opts.espeakDataDir
 * @param {string} opts.onnxPath
 * @param {string} opts.configPath
 * @param {string} opts.text          single utterance (newlines collapsed by caller)
 * @param {number} [opts.lengthScale] Piper --length_scale (0.5x-2.0x maps to 2.0-0.5, see synth.js)
 * @param {string} opts.outPath       destination WAV path
 * @returns {Promise<string>} outPath
 */
function synthText(opts) {
  const { piperExe, espeakDataDir, onnxPath, configPath, text, lengthScale, outPath } = opts;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const args = [
    '--model', onnxPath,
    '--config', configPath,
    '--output_file', outPath,
    '--espeak_data', espeakDataDir
  ];
  if (lengthScale) args.push('--length_scale', String(lengthScale));

  return new Promise((resolve, reject) => {
    const child = spawn(piperExe, args, { windowsHide: true, cwd: path.dirname(piperExe) });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    // Normalize to a single line — Piper treats each stdin line as its own
    // utterance; a paragraph chunk must be synthesized as one utterance.
    const line = String(text).replace(/\r?\n/g, ' ').trim() || ' ';
    child.stdin.write(line + '\n');
    child.stdin.end();
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`piper.exe exited with code ${code}:\n${stderr.slice(-3000)}`));
      }
      if (!fs.existsSync(outPath)) {
        return reject(new Error('piper.exe did not produce output file: ' + outPath + '\n' + stderr.slice(-2000)));
      }
      resolve(outPath);
    });
  });
}

module.exports = { synthText, readVoiceSampleRate };
