'use strict';
/* Renderer logic — talks to main via window.api (preload bridge). */

const $ = (id) => document.getElementById(id);

let catalog = [];               // full voice catalog with .installed flag
let appSettings = null;
let currentProject = {
  id: null,
  title: 'Untitled document',
  defaults: { voice: null, speed: 1 },
  paragraphs: []
};
let paraSeq = 0;
let activeJobKind = null; // 'export' | 'batch'
let batchFiles = [];
let batchOutDir = null;
let toastTimer = null;

function toast(msg, isError) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3800);
}

function fmtBytes(n) {
  if (!n) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
}

function errMsg(err) {
  return String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': Error: /, '');
}

/* ================= Navigation ================= */
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $('view-' + btn.dataset.view).classList.remove('hidden');
    if (btn.dataset.view === 'voices') renderVoiceGrid();
    if (btn.dataset.view === 'projects') renderProjectsList();
    if (btn.dataset.view === 'batch') refreshVoiceSelects();
    if (btn.dataset.view === 'settings') renderSettingsForm();
  });
});

/* ================= Voice catalog / selects ================= */

function voiceOptionsHtml(includeInherit) {
  let html = includeInherit ? '<option value="">Inherit document default</option>' : '';
  for (const v of catalog) {
    const suffix = v.installed ? '' : ' (not installed)';
    html += `<option value="${v.id}">${v.name} — ${v.langLabel}${suffix}</option>`;
  }
  return html;
}

async function refreshCatalog() {
  catalog = await window.api.voicesCatalog();
}

function refreshVoiceSelects() {
  const defaultSel = $('defaultVoice');
  const prevDefault = defaultSel.value;
  defaultSel.innerHTML = voiceOptionsHtml(false);
  if (catalog.some((v) => v.id === prevDefault)) defaultSel.value = prevDefault;
  else if (currentProject.defaults.voice) defaultSel.value = currentProject.defaults.voice;

  const batchSel = $('batchVoice');
  const prevBatch = batchSel.value;
  batchSel.innerHTML = voiceOptionsHtml(false);
  if (catalog.some((v) => v.id === prevBatch)) batchSel.value = prevBatch;

  const settingsSel = $('settingsDefaultVoice');
  settingsSel.innerHTML = voiceOptionsHtml(false);

  document.querySelectorAll('.para-voice').forEach((sel) => {
    const prev = sel.value;
    sel.innerHTML = voiceOptionsHtml(true);
    sel.value = prev;
  });
}

/* ================= Engine badge / first-run setup ================= */

async function refreshBadge() {
  try {
    const st = await window.api.binariesStatus();
    const installed = await window.api.voicesInstalled();
    const badge = $('engineBadge');
    const ready = st.piperInstalled && installed.length > 0;
    badge.textContent = ready
      ? `engine ready · Piper ${st.piperVersion} · ${installed.length} voice(s)`
      : 'engine not set up yet';
    badge.className = 'badge ' + (ready ? 'badge-ok' : 'badge-warn');
    return { st, installed };
  } catch (e) {
    return { st: null, installed: [] };
  }
}

window.api.onSetupProgress((p) => {
  const modal = $('setupModal');
  if (p.stage === 'done') {
    $('setupModalSub').textContent = 'Done.';
    return;
  }
  modal.classList.remove('hidden');
  const label = p.stage === 'binary'
    ? 'Downloading Piper engine (one-time, ~22 MB)'
    : `Downloading voice ${p.voice || ''} (one-time, ~60 MB)`;
  $('setupModalText').textContent = label;
  $('setupModalFill').style.width = (p.pct != null ? p.pct : 20) + '%';
  $('setupModalSub').textContent = `${fmtBytes(p.received)}${p.total ? ' / ' + fmtBytes(p.total) : ''}`;
});

async function ensureFirstRunSetup() {
  const { st, installed } = await refreshBadge();
  if (st && st.piperInstalled && installed.length > 0) return;
  $('setupModal').classList.remove('hidden');
  try {
    if (!st || !st.piperInstalled) {
      $('setupModalText').textContent = 'Downloading Piper engine (one-time)…';
      await window.api.ensurePiper();
    }
    const stillInstalled = await window.api.voicesInstalled();
    if (stillInstalled.length === 0) {
      $('setupModalText').textContent = 'Downloading default voice (one-time)…';
      await window.api.voicesDownload(appSettings.defaultVoice || 'en_US-amy-medium');
    }
    await refreshCatalog();
    refreshVoiceSelects();
    await refreshBadge();
    toast('Voicebarn is ready to go');
  } catch (err) {
    toast('Setup failed: ' + errMsg(err), true);
  } finally {
    $('setupModal').classList.add('hidden');
  }
}

/* ================= Voice manager view ================= */

async function renderVoiceGrid() {
  await refreshCatalog();
  const grid = $('voiceGrid');
  grid.innerHTML = '';
  for (const v of catalog) {
    const card = document.createElement('div');
    card.className = 'voice-card';
    card.innerHTML = `
      <div class="voice-name">${v.name}</div>
      <div class="voice-lang">${v.langLabel} · ${v.quality}</div>
      <div class="voice-size">${fmtBytes(v.sizeBytes)}</div>
      <div class="voice-actions"></div>
    `;
    const actions = card.querySelector('.voice-actions');
    if (v.installed) {
      const label = document.createElement('span');
      label.className = 'voice-installed';
      label.textContent = '✓ Installed';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-small';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', async () => {
        await window.api.voicesRemove(v.id);
        toast('Removed ' + v.name);
        renderVoiceGrid();
        refreshVoiceSelects();
      });
      actions.append(label, removeBtn);
    } else {
      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn btn-small btn-primary';
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', async () => {
        dlBtn.disabled = true;
        dlBtn.textContent = 'Downloading…';
        try {
          await window.api.voicesDownload(v.id);
          toast('Downloaded ' + v.name);
          renderVoiceGrid();
          refreshVoiceSelects();
          refreshBadge();
        } catch (err) {
          toast('Download failed: ' + errMsg(err), true);
          dlBtn.disabled = false;
          dlBtn.textContent = 'Download';
        }
      });
      actions.appendChild(dlBtn);
    }
    grid.appendChild(card);
  }
}

/* ================= Editor: paragraphs ================= */

function newParagraph(text) {
  paraSeq += 1;
  return { id: 'para-' + Date.now() + '-' + paraSeq, text: text || '', voice: null, speed: null, pauseAfterMs: 0 };
}

function renderParagraphs() {
  const list = $('paragraphList');
  list.innerHTML = '';
  currentProject.paragraphs.forEach((para, i) => {
    const card = document.createElement('div');
    card.className = 'paragraph-card';
    card.innerHTML = `
      <div class="para-index">PARAGRAPH ${i + 1}</div>
      <textarea placeholder="Type or paste text here. Use &lt;pause 500ms&gt; for a pause.">${escapeHtml(para.text)}</textarea>
      <div class="paragraph-toolbar">
        <div class="field">
          <label>Voice</label>
          <select class="para-voice">${voiceOptionsHtml(true)}</select>
        </div>
        <div class="field">
          <label>Speed</label>
          <select class="para-speed">
            <option value="">Inherit</option>
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>
        <div class="field">
          <label>Pause after (ms)</label>
          <input type="number" class="para-pause" min="0" step="50" value="${para.pauseAfterMs || 0}" style="width:90px" />
        </div>
        <div class="para-actions">
          <button class="btn btn-icon para-preview" title="Preview">▶ Preview</button>
          <button class="btn btn-icon para-up" title="Move up">↑</button>
          <button class="btn btn-icon para-down" title="Move down">↓</button>
          <button class="btn btn-icon para-del" title="Delete">✕</button>
        </div>
      </div>
    `;
    const textarea = card.querySelector('textarea');
    const voiceSel = card.querySelector('.para-voice');
    const speedSel = card.querySelector('.para-speed');
    const pauseInput = card.querySelector('.para-pause');

    textarea.addEventListener('input', () => { para.text = textarea.value; });
    voiceSel.value = para.voice || '';
    voiceSel.addEventListener('change', () => { para.voice = voiceSel.value || null; });
    speedSel.value = para.speed ? String(para.speed) : '';
    speedSel.addEventListener('change', () => { para.speed = speedSel.value ? Number(speedSel.value) : null; });
    pauseInput.addEventListener('change', () => { para.pauseAfterMs = Number(pauseInput.value) || 0; });

    card.querySelector('.para-preview').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const wavPath = await window.api.ttsPreview(para);
        const audio = $('previewAudio');
        audio.src = 'file:///' + wavPath.replace(/\\/g, '/');
        await audio.play();
      } catch (err) {
        toast('Preview failed: ' + errMsg(err), true);
      } finally {
        btn.disabled = false;
        btn.textContent = '▶ Preview';
      }
    });
    card.querySelector('.para-up').addEventListener('click', () => {
      if (i === 0) return;
      const arr = currentProject.paragraphs;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      renderParagraphs();
    });
    card.querySelector('.para-down').addEventListener('click', () => {
      const arr = currentProject.paragraphs;
      if (i === arr.length - 1) return;
      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      renderParagraphs();
    });
    card.querySelector('.para-del').addEventListener('click', () => {
      currentProject.paragraphs.splice(i, 1);
      renderParagraphs();
    });

    list.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('addParagraphBtn').addEventListener('click', () => {
  currentProject.paragraphs.push(newParagraph(''));
  renderParagraphs();
});

$('docTitle').addEventListener('input', (e) => { currentProject.title = e.target.value; });
$('defaultVoice').addEventListener('change', (e) => { currentProject.defaults.voice = e.target.value || null; });
$('defaultSpeed').addEventListener('change', (e) => { currentProject.defaults.speed = Number(e.target.value); });
$('exportFormat').addEventListener('change', (e) => {
  $('bitrateField').style.display = e.target.value === 'mp3' ? '' : 'none';
});

/* ================= Save / Export ================= */

$('saveProjectBtn').addEventListener('click', async () => {
  try {
    const saved = await window.api.projectsSave(currentProject);
    currentProject = saved;
    toast('Saved "' + saved.title + '"');
  } catch (err) {
    toast('Save failed: ' + errMsg(err), true);
  }
});

window.api.onJobProgress((p) => {
  if (activeJobKind === 'export') {
    const panel = $('exportPanel');
    panel.classList.remove('hidden');
    const phaseLabel = { synth: `Synthesizing paragraph ${p.index + 1}/${p.total}`, join: 'Joining audio…', encode: 'Encoding ' + (p.format || '').toUpperCase() + '…', done: 'Done' }[p.phase] || p.phase;
    $('exportPhase').textContent = phaseLabel || '';
    const pct = p.phase === 'done' ? 100 : p.total ? Math.round(((p.index || 0) / p.total) * 90) : 30;
    $('exportFill').style.width = pct + '%';
  } else if (activeJobKind === 'batch') {
    updateBatchProgressUI(p);
  }
});

$('exportBtn').addEventListener('click', async () => {
  if (currentProject.paragraphs.length === 0) { toast('Add at least one paragraph first', true); return; }
  const format = $('exportFormat').value;
  const bitrate = Number($('mp3Bitrate').value);
  const defaultName = (currentProject.title || 'export').replace(/[\\/:*?"<>|]/g, '_') + '.' + format;
  const outPath = await window.api.saveFileDialog(defaultName, format);
  if (!outPath) return;

  activeJobKind = 'export';
  $('exportPanel').classList.remove('hidden');
  $('exportFill').style.width = '0%';
  $('exportPhase').textContent = 'Preparing…';
  $('exportBtn').disabled = true;
  try {
    const res = await window.api.ttsExport(currentProject, { format, bitrate, outPath });
    toast('Exported to ' + res.outPath);
    window.api.openInFolder(res.outPath);
  } catch (err) {
    toast('Export failed: ' + errMsg(err), true);
  } finally {
    $('exportBtn').disabled = false;
    activeJobKind = null;
    setTimeout(() => $('exportPanel').classList.add('hidden'), 1200);
  }
});

/* ================= Batch mode ================= */

$('batchAddFiles').addEventListener('click', async () => {
  const files = await window.api.chooseFiles();
  if (!files || files.length === 0) return;
  for (const f of files) if (!batchFiles.includes(f)) batchFiles.push(f);
  renderBatchFileList();
});

function renderBatchFileList() {
  const list = $('batchFileList');
  list.innerHTML = '';
  batchFiles.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'batch-file-item';
    const name = f.split(/[\\/]/).pop();
    item.innerHTML = `<span>${name}</span>`;
    const del = document.createElement('button');
    del.className = 'btn btn-icon';
    del.textContent = '✕';
    del.addEventListener('click', () => { batchFiles.splice(i, 1); renderBatchFileList(); });
    item.appendChild(del);
    list.appendChild(item);
  });
  $('batchRunBtn').disabled = !(batchFiles.length > 0 && batchOutDir);
}

$('batchOutDirBtn').addEventListener('click', async () => {
  const dir = await window.api.chooseFolder();
  if (!dir) return;
  batchOutDir = dir;
  $('batchOutDirLabel').textContent = 'Output: ' + dir;
  renderBatchFileList();
});

function updateBatchProgressUI(p) {
  const container = $('batchProgress');
  let item = container.querySelector(`[data-idx="${p.fileIndex}"]`);
  if (!item) {
    item = document.createElement('div');
    item.className = 'batch-progress-item';
    item.dataset.idx = p.fileIndex;
    item.innerHTML = `<div class="job-row"><div class="job-name"></div><div class="job-phase"></div></div><div class="progress-track"><div class="progress-fill"></div></div>`;
    container.appendChild(item);
  }
  const name = (p.file || '').split(/[\\/]/).pop();
  item.querySelector('.job-name').textContent = `${name} (${p.fileIndex + 1}/${p.totalFiles})`;
  const phaseLabel = { start: 'Starting…', synth: 'Synthesizing…', join: 'Joining…', encode: 'Encoding…', done: 'Done ✓' }[p.phase] || p.phase;
  item.querySelector('.job-phase').textContent = phaseLabel;
  const pct = p.phase === 'done' ? 100 : p.phase === 'start' ? 5 : 50;
  item.querySelector('.progress-fill').style.width = pct + '%';
}

$('batchRunBtn').addEventListener('click', async () => {
  $('batchRunBtn').disabled = true;
  $('batchProgress').innerHTML = '';
  activeJobKind = 'batch';
  const defaults = {
    voice: $('batchVoice').value,
    speed: Number($('batchSpeed').value),
    format: $('batchFormat').value,
    bitrate: 192
  };
  try {
    const res = await window.api.batchRun(batchFiles, defaults, batchOutDir);
    toast(`Batch complete — ${res.results.length} file(s) written`);
    window.api.openInFolder(res.results[0] && res.results[0].output);
  } catch (err) {
    toast('Batch failed: ' + errMsg(err), true);
  } finally {
    activeJobKind = null;
    $('batchRunBtn').disabled = !(batchFiles.length > 0 && batchOutDir);
  }
});

/* ================= Projects ================= */

async function renderProjectsList() {
  const items = await window.api.projectsList();
  const list = $('projectsList');
  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = '<div class="project-meta">No saved projects yet.</div>';
    return;
  }
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'project-item';
    row.innerHTML = `
      <div>
        <div>${escapeHtml(it.title)}</div>
        <div class="project-meta">${it.paragraphCount} paragraph(s) · ${new Date(it.updatedAt).toLocaleString()}</div>
      </div>
      <button class="btn btn-small">Delete</button>
    `;
    row.addEventListener('click', async (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const p = await window.api.projectsLoad(it.id);
      currentProject = p;
      $('docTitle').value = p.title;
      refreshVoiceSelects();
      $('defaultVoice').value = p.defaults.voice || '';
      $('defaultSpeed').value = String(p.defaults.speed || 1);
      renderParagraphs();
      document.querySelector('[data-view="editor"]').click();
    });
    row.querySelector('button').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.projectsDelete(it.id);
      renderProjectsList();
    });
    list.appendChild(row);
  }
}

/* ================= Settings ================= */

function renderSettingsForm() {
  $('settingsDefaultVoice').value = appSettings.defaultVoice || '';
  $('settingsDefaultSpeed').value = String(appSettings.defaultSpeed || 1);
  $('settingsMp3Bitrate').value = String(appSettings.mp3Bitrate || 192);
  window.api.binariesStatus().then((st) => { $('dataDirValue').textContent = st.dataDir; });
}

$('saveSettingsBtn').addEventListener('click', async () => {
  appSettings = await window.api.settingsSet({
    defaultVoice: $('settingsDefaultVoice').value || null,
    defaultSpeed: Number($('settingsDefaultSpeed').value),
    mp3Bitrate: Number($('settingsMp3Bitrate').value)
  });
  toast('Settings saved');
});

$('openDataDirBtn').addEventListener('click', async () => {
  const st = await window.api.binariesStatus();
  window.api.openInFolder(st.dataDir);
});

/* ================= Boot ================= */

(async function boot() {
  appSettings = await window.api.settingsGet();
  await refreshCatalog();
  refreshVoiceSelects();
  if (appSettings.defaultVoice) $('defaultVoice').value = appSettings.defaultVoice;
  if (appSettings.defaultSpeed) $('defaultSpeed').value = String(appSettings.defaultSpeed);
  currentProject.defaults.voice = $('defaultVoice').value || null;
  currentProject.defaults.speed = Number($('defaultSpeed').value);
  currentProject.paragraphs.push(newParagraph('Welcome to Voicebarn. Type your script here, one paragraph per card. <pause 500ms> You can preview any paragraph before exporting.'));
  renderParagraphs();
  await ensureFirstRunSetup();
  await refreshCatalog();
  refreshVoiceSelects();
})();
