'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // binaries
  binariesStatus: () => ipcRenderer.invoke('binaries:status'),
  ensurePiper: () => ipcRenderer.invoke('binaries:ensurePiper'),

  // voices
  voicesCatalog: () => ipcRenderer.invoke('voices:catalog'),
  voicesInstalled: () => ipcRenderer.invoke('voices:installed'),
  voicesDownload: (id) => ipcRenderer.invoke('voices:download', id),
  voicesRemove: (id) => ipcRenderer.invoke('voices:remove', id),

  // tts
  ttsPreview: (paragraph) => ipcRenderer.invoke('tts:preview', paragraph),
  ttsExport: (project, options) => ipcRenderer.invoke('tts:export', { project, options }),

  // batch
  batchRun: (files, defaults, outDir) => ipcRenderer.invoke('batch:run', { files, defaults, outDir }),

  // projects
  projectsList: () => ipcRenderer.invoke('projects:list'),
  projectsSave: (project) => ipcRenderer.invoke('projects:save', project),
  projectsLoad: (id) => ipcRenderer.invoke('projects:load', id),
  projectsDelete: (id) => ipcRenderer.invoke('projects:delete', id),

  // settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (partial) => ipcRenderer.invoke('settings:set', partial),

  // dialogs / shell
  chooseFiles: () => ipcRenderer.invoke('dialog:chooseFiles'),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  saveFileDialog: (defaultName, format) => ipcRenderer.invoke('dialog:saveFile', { defaultName, format }),
  openInFolder: (filePath) => ipcRenderer.invoke('shell:openInFolder', filePath),

  // events
  onSetupProgress: (cb) => ipcRenderer.on('setup:progress', (_e, p) => cb(p)),
  onJobProgress: (cb) => ipcRenderer.on('job:progress', (_e, p) => cb(p))
});
