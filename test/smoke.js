'use strict';
/**
 * End-to-end smoke test (no Electron needed) — exercises the real pipeline:
 *
 *   1. Downloads the actual Piper Windows binary (~22 MB) if missing, unzips it,
 *      and verifies piper.exe + espeak-ng-data are both present
 *   2. Downloads a real curated voice (en_US-amy-medium, ~60 MB) from Hugging Face
 *   3. Synthesizes "Hello from Voicebarn." and validates the WAV header/duration
 *   4. Confirms length_scale (speed) actually changes output duration
 *   5. Exercises the SSML-lite pause pipeline end-to-end + unit-tests the token parser
 *   6. Exports a multi-paragraph, multi-speed project to WAV and to MP3
 *   7. Runs batch mode over two fixture .txt files + round-trips a project through JSON
 *
 * Assets are cached in test/.cache so re-runs are fast.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dl = require('../src/lib/download');
const { parsePauseTokens, stripPauseTokens } = require('../src/lib/ssml');
const { readWavInfo, wavDurationSec } = require('../src/lib/audio');
const synth = require('../src/lib/synth');
const { textToParagraphs, runBatch } = require('../src/lib/batch');
const { Projects } = require('../src/lib/projects');

const CACHE = path.join(__dirname, '.cache');   // binary + voices (kept between runs)
const WORK = path.join(__dirname, '.work');     // per-run outputs (wiped)

function log(msg) { console.log('[smoke] ' + msg); }

function progressLogger(label) {
  let lastPct = -10;
  return (p) => {
    const pct = p.total ? Math.round((p.received / p.total) * 100) : 0;
    if (pct >= lastPct + 10) {
      lastPct = pct;
      log(`${label}: ${pct}% (${(p.received / 1048576).toFixed(1)} MB)`);
    }
  };
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });

  /* ---------- 1. real Piper binary download + unzip ---------- */
  log('ensuring Piper binary (' + dl.PIPER_VERSION + ')...');
  const piperExe = await dl.ensurePiper(CACHE, progressLogger('binary'));
  assert.ok(fs.existsSync(piperExe), 'piper.exe exists');
  const espeakDataDir = dl.espeakDataPath(CACHE);
  assert.ok(espeakDataDir && fs.existsSync(espeakDataDir), 'espeak-ng-data directory exists next to piper.exe');
  log('piper.exe: ' + piperExe);
  log('espeak-ng-data: ' + espeakDataDir);

  const helpRun = spawnSync(piperExe, ['--help'], { encoding: 'utf8', cwd: path.dirname(piperExe) });
  assert.strictEqual(helpRun.status, 0, 'piper.exe --help exits 0');
  assert.ok(/usage/i.test(helpRun.stderr || helpRun.stdout || ''), 'piper.exe --help prints usage');
  log('piper.exe --help OK (exit 0)');

  /* ---------- 2. real voice download from Hugging Face ---------- */
  const VOICE = 'en_US-amy-medium';
  log('ensuring voice ' + VOICE + '...');
  const { onnxPath, configPath } = await dl.ensureVoice(CACHE, VOICE, progressLogger('voice'));
  const onnxSize = fs.statSync(onnxPath).size;
  assert.ok(onnxSize > 20 * 1024 * 1024, '.onnx is plausibly sized (>20MB), got ' + onnxSize);
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(cfg && cfg.audio && cfg.audio.sample_rate, '.onnx.json parses and has audio.sample_rate');
  log('voice: ' + onnxPath + ' (' + (onnxSize / 1048576).toFixed(1) + ' MB), sample_rate=' + cfg.audio.sample_rate);

  const ctx = {
    piperExe,
    espeakDataDir,
    getVoicePaths: (voiceId) => {
      assert.strictEqual(voiceId, VOICE, 'smoke test only installs one voice');
      return { onnxPath, configPath };
    }
  };

  /* ---------- 3. basic synthesis + WAV header validation ---------- */
  log('synthesizing "Hello from Voicebarn."...');
  const helloDir = path.join(WORK, 'hello');
  const helloWav = await synth.synthParagraph(ctx, { text: 'Hello from Voicebarn.' }, { voice: VOICE, speed: 1 }, helloDir);
  assert.ok(fs.existsSync(helloWav), 'hello wav exists');
  const helloInfo = readWavInfo(helloWav);
  assert.strictEqual(helloInfo.audioFormat, 1, 'PCM WAV');
  assert.strictEqual(helloInfo.sampleRate, cfg.audio.sample_rate, 'wav sample rate matches voice config');
  const helloDur = wavDurationSec(helloWav);
  assert.ok(helloDur > 0.5, 'hello wav duration > 0.5s, got ' + helloDur.toFixed(2));
  log('hello wav: ' + helloWav + ' (' + helloDur.toFixed(2) + 's, ' + helloInfo.sampleRate + 'Hz)');

  /* ---------- 4. speed (length_scale) check ---------- */
  log('checking length_scale affects duration...');
  const fastDir = path.join(WORK, 'speed-fast');
  const slowDir = path.join(WORK, 'speed-slow');
  const fastWav = await synth.synthParagraph(ctx, { text: 'This sentence is spoken at a normal pace for comparison.' }, { voice: VOICE, speed: 1.0 }, fastDir);
  const slowWav = await synth.synthParagraph(ctx, { text: 'This sentence is spoken at a normal pace for comparison.' }, { voice: VOICE, speed: 0.625 }, slowDir); // length_scale 1.6
  const fastDur = wavDurationSec(fastWav);
  const slowDur = wavDurationSec(slowWav);
  assert.ok(slowDur > fastDur, `slower speed (0.625x) produced longer audio (${slowDur.toFixed(2)}s) than 1.0x (${fastDur.toFixed(2)}s)`);
  log(`speed check OK: 1.0x=${fastDur.toFixed(2)}s vs 0.625x(len_scale 1.6)=${slowDur.toFixed(2)}s`);

  /* ---------- 5. SSML-lite pause pipeline + token parser unit test ---------- */
  log('checking pause token parser...');
  const tokens = parsePauseTokens('One. <pause 800ms> Two.');
  assert.strictEqual(tokens.length, 3, 'three chunks: text, pause, text');
  assert.strictEqual(tokens[0].type, 'text');
  assert.strictEqual(tokens[1].type, 'pause');
  assert.strictEqual(tokens[1].ms, 800);
  assert.strictEqual(tokens[2].type, 'text');
  const secTokens = parsePauseTokens('A [pause 0.5s] B');
  assert.strictEqual(secTokens[1].ms, 500, '[pause 0.5s] parses to 500ms');
  assert.strictEqual(stripPauseTokens('A <pause 500ms> B'), 'A B', 'stripPauseTokens removes the token');

  log('checking pause-only paragraph produces an exact 800ms silence WAV (deterministic, no model jitter)...');
  const pureDir = path.join(WORK, 'pause-pure');
  const pureWav = await synth.synthParagraph(ctx, { text: '<pause 800ms>' }, { voice: VOICE, speed: 1 }, pureDir);
  const pureDur = wavDurationSec(pureWav);
  assert.ok(Math.abs(pureDur - 0.8) < 0.01, `pure 800ms pause wav duration is ~0.8s, got ${pureDur.toFixed(3)}s`);
  log(`pure pause check OK: ${pureDur.toFixed(3)}s`);

  log('checking pause pipeline adds real silence relative to a no-pause version...');
  const noPauseDir = path.join(WORK, 'pause-none');
  const withPauseDir = path.join(WORK, 'pause-yes');
  const noPauseWav = await synth.synthParagraph(ctx, { text: 'One. Two.' }, { voice: VOICE, speed: 1 }, noPauseDir);
  const withPauseWav = await synth.synthParagraph(ctx, { text: 'One. <pause 800ms> Two.' }, { voice: VOICE, speed: 1 }, withPauseDir);
  const noPauseDur = wavDurationSec(noPauseWav);
  const withPauseDur = wavDurationSec(withPauseWav);
  // Margin is intentionally below the full 800ms: splitting "One."/"Two." into two
  // separate Piper utterances (vs. one joint utterance) has its own small, model-driven
  // pacing variance, so we only assert the pause clearly dominates that variance.
  assert.ok(withPauseDur >= noPauseDur + 0.5, `paused version (${withPauseDur.toFixed(2)}s) >= no-pause (${noPauseDur.toFixed(2)}s) + 0.5s`);
  log(`pause check OK: no-pause=${noPauseDur.toFixed(2)}s, with-800ms-pause=${withPauseDur.toFixed(2)}s`);

  /* ---------- 6. multi-paragraph export (WAV + MP3) ---------- */
  log('exporting multi-paragraph project (two speeds) to WAV...');
  const project = {
    id: null,
    title: 'Smoke Test Project',
    defaults: { voice: VOICE, speed: 1 },
    paragraphs: [
      { id: 'p1', text: 'This is the first paragraph, spoken normally.', voice: VOICE, speed: 1, pauseAfterMs: 300 },
      { id: 'p2', text: 'This is the second paragraph, spoken more slowly. <pause 400ms> With a pause inside it too.', voice: VOICE, speed: 1.4, pauseAfterMs: 0 }
    ]
  };
  const exportWorkDir = path.join(WORK, 'export-wav');
  const wavOut = path.join(WORK, 'export.wav');
  await synth.exportProject(ctx, project, { format: 'wav', outPath: wavOut }, exportWorkDir);
  assert.ok(fs.existsSync(wavOut), 'export wav exists');
  const exportInfo = readWavInfo(wavOut);
  assert.strictEqual(exportInfo.audioFormat, 1, 'exported wav is valid PCM');
  assert.ok(wavDurationSec(wavOut) > helloDur, 'multi-paragraph export is longer than single hello clip');
  log('WAV export: ' + wavOut + ' (' + wavDurationSec(wavOut).toFixed(2) + 's)');

  log('exporting same project to MP3 via ffmpeg-static...');
  const mp3WorkDir = path.join(WORK, 'export-mp3');
  const mp3Out = path.join(WORK, 'export.mp3');
  await synth.exportProject(ctx, project, { format: 'mp3', bitrate: 192, outPath: mp3Out }, mp3WorkDir);
  const mp3Size = fs.statSync(mp3Out).size;
  assert.ok(mp3Size > 5 * 1024, 'mp3 file is >5KB, got ' + mp3Size);
  const mp3Head = fs.readFileSync(mp3Out).subarray(0, 3);
  const isID3 = mp3Head.toString('ascii', 0, 3) === 'ID3';
  const isMpegSync = mp3Head[0] === 0xff && (mp3Head[1] & 0xe0) === 0xe0;
  assert.ok(isID3 || isMpegSync, 'mp3 starts with ID3 tag or MPEG sync bytes');
  log('MP3 export: ' + mp3Out + ' (' + (mp3Size / 1024).toFixed(1) + ' KB, ' + (isID3 ? 'ID3' : 'MPEG-sync') + ' header)');

  /* ---------- 7. batch mode + project JSON round-trip ---------- */
  log('running batch mode over two fixture .txt files...');
  const batchInDir = path.join(WORK, 'batch-in');
  const batchOutDir = path.join(WORK, 'batch-out');
  const batchWorkRoot = path.join(WORK, 'batch-work');
  fs.mkdirSync(batchInDir, { recursive: true });
  const fixtureA = path.join(batchInDir, 'a.txt');
  const fixtureB = path.join(batchInDir, 'b.txt');
  fs.writeFileSync(fixtureA, 'First fixture file.\n\nIt has two paragraphs.');
  fs.writeFileSync(fixtureB, 'Second fixture file, single paragraph.');
  const batchDefaults = { voice: VOICE, speed: 1, format: 'wav', bitrate: 192 };
  const batchResults = await runBatch(ctx, [fixtureA, fixtureB], batchDefaults, batchOutDir, batchWorkRoot, (p) => {
    if (p.phase === 'done') log('batch: ' + path.basename(p.file) + ' -> ' + p.output);
  });
  assert.strictEqual(batchResults.length, 2, 'two batch outputs produced');
  for (const r of batchResults) {
    assert.ok(fs.existsSync(r.output), 'batch output exists: ' + r.output);
    assert.ok(fs.statSync(r.output).size > 1000, 'batch output has real content: ' + r.output);
  }
  const paragraphsA = textToParagraphs(fs.readFileSync(fixtureA, 'utf8'));
  assert.strictEqual(paragraphsA.length, 2, 'blank-line splitting produced 2 paragraphs for fixture A');

  log('project save/load round-trip (BOM-free JSON)...');
  const projects = new Projects(WORK);
  const saved = projects.save({ title: 'Round Trip Project', defaults: { voice: VOICE, speed: 1 }, paragraphs: paragraphsA });
  assert.ok(saved.id, 'saved project has an id');
  const loaded = projects.load(saved.id);
  assert.strictEqual(loaded.title, 'Round Trip Project');
  assert.strictEqual(loaded.paragraphs.length, 2);
  // Confirm the file on disk is BOM-free, directly JSON.parse-able (Node write, never PowerShell).
  const rawFile = fs.readFileSync(path.join(WORK, 'projects', saved.id + '.json'), 'utf8');
  assert.ok(!rawFile.startsWith('﻿'), 'project JSON file has no BOM');
  JSON.parse(rawFile);
  const list = projects.list();
  assert.ok(list.some((p) => p.id === saved.id), 'project appears in list()');
  projects.delete(saved.id);
  assert.ok(!projects.list().some((p) => p.id === saved.id), 'project removed after delete()');

  log('ALL SMOKE TESTS PASSED');
})().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
