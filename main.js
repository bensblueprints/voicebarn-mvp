'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dl = require('./src/lib/download');
const synth = require('./src/lib/synth');
const { runBatch } = require('./src/lib/batch');
const { Projects } = require('./src/lib/projects');
const { Settings } = require('./src/lib/settings');
const { gateLicense, registerLicenseIpc } = require('./license-gate');

const SMOKE = process.argv.includes('--smoke');
let win = null;
let dataDir = null;
let projects = null;
let settings = null;
let busy = false;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    title: 'Voicebarn',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE) {
    win.webContents.once('did-finish-load', () => {
      console.log('[smoke] renderer loaded OK');
      setTimeout(() => app.quit(), 500);
    });
  }
}

app.whenReady().then(async () => {
  if (!(await gateLicense())) return; // quit already requested
  registerLicenseIpc();
  dataDir = app.getPath('userData');
  projects = new Projects(dataDir);
  settings = new Settings(dataDir);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- synth context helper ---------------- */

function synthCtx() {
  const piperExe = dl.piperExePath(dataDir);
  const espeakDataDir = dl.espeakDataPath(dataDir);
  if (!piperExe || !espeakDataDir) throw new Error('Piper engine not installed yet — run setup first.');
  return {
    piperExe,
    espeakDataDir,
    getVoicePaths: (voiceId) => dl.voicePaths(dataDir, voiceId)
  };
}

function progressReporter(jobId) {
  return (p) => send('job:progress', { jobId, ...p });
}

/* ---------------- IPC: binaries ---------------- */

ipcMain.handle('binaries:status', () => ({
  piperInstalled: !!(dl.piperExePath(dataDir) && dl.espeakDataPath(dataDir)),
  piperVersion: dl.PIPER_VERSION,
  dataDir
}));

ipcMain.handle('binaries:ensurePiper', async () => {
  const onProgress = (p) => send('setup:progress', {
    stage: p.stage, received: p.received, total: p.total,
    pct: p.total ? Math.round((p.received / p.total) * 100) : null
  });
  const binPath = await dl.ensurePiper(dataDir, onProgress);
  send('setup:progress', { stage: 'done' });
  return { binPath };
});

/* ---------------- IPC: voices ---------------- */

ipcMain.handle('voices:catalog', () => {
  const installedIds = new Set(dl.installedVoices(dataDir).map((v) => v.id));
  return Object.values(dl.CATALOG).map((v) => ({ ...v, installed: installedIds.has(v.id) }));
});

ipcMain.handle('voices:installed', () => dl.installedVoices(dataDir));

ipcMain.handle('voices:download', async (_e, voiceId) => {
  const onProgress = (p) => send('setup:progress', {
    stage: p.stage, voice: p.voice, received: p.received, total: p.total,
    pct: p.total ? Math.round((p.received / p.total) * 100) : null
  });
  await dl.ensureVoice(dataDir, voiceId, onProgress);
  send('setup:progress', { stage: 'done', voice: voiceId });
  return dl.installedVoices(dataDir);
});

ipcMain.handle('voices:remove', (_e, voiceId) => {
  dl.removeVoice(dataDir, voiceId);
  return dl.installedVoices(dataDir);
});

/* ---------------- IPC: tts preview / export ---------------- */

ipcMain.handle('tts:preview', async (_e, paragraph) => {
  const ctx = synthCtx();
  const cacheDir = path.join(dataDir, 'cache', 'previews');
  const defaults = settings.get();
  return synth.previewParagraph(ctx, paragraph, { voice: defaults.defaultVoice, speed: defaults.defaultSpeed }, cacheDir);
});

ipcMain.handle('tts:export', async (_e, { project, options }) => {
  if (busy) throw new Error('An export is already running.');
  busy = true;
  const jobId = 'export-' + Date.now();
  try {
    const ctx = synthCtx();
    const workDir = path.join(dataDir, 'cache', 'export-' + Date.now());
    const outPath = await synth.exportProject(ctx, project, options, workDir, progressReporter(jobId));
    fs.rmSync(workDir, { recursive: true, force: true });
    return { jobId, outPath };
  } finally {
    busy = false;
  }
});

/* ---------------- IPC: batch ---------------- */

ipcMain.handle('batch:run', async (_e, { files, defaults, outDir }) => {
  if (busy) throw new Error('A job is already running.');
  busy = true;
  const jobId = 'batch-' + Date.now();
  try {
    const ctx = synthCtx();
    const workRoot = path.join(dataDir, 'cache', jobId);
    const results = await runBatch(ctx, files, defaults, outDir, workRoot, progressReporter(jobId));
    fs.rmSync(workRoot, { recursive: true, force: true });
    return { jobId, results };
  } finally {
    busy = false;
  }
});

/* ---------------- IPC: projects ---------------- */

ipcMain.handle('projects:list', () => projects.list());
ipcMain.handle('projects:save', (_e, project) => projects.save(project));
ipcMain.handle('projects:load', (_e, id) => projects.load(id));
ipcMain.handle('projects:delete', (_e, id) => { projects.delete(id); return projects.list(); });

/* ---------------- IPC: settings ---------------- */

ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, partial) => settings.set(partial));

/* ---------------- IPC: dialogs / shell ---------------- */

ipcMain.handle('dialog:chooseFiles', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:chooseFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_e, { defaultName, format }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('shell:openInFolder', (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});

ipcMain.handle('sys:cpuThreads', () => Math.max(1, os.cpus().length));
