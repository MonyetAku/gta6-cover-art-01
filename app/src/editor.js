// Sunset Strip editor — wires the cover renderer to the page: photo loading, layout and
// grade pickers, caption editing, per-panel crop and position, undo/redo and PNG export.
// Photos are read on the user's own machine and never uploaded anywhere.

import { LAYOUTS, GRADES, SIZES, panelsFor, renderCover, hitPanel } from './render.js';

const SAMPLES = [
  { id: 'sample:pier', name: 'Pier', src: './samples/pier.jpg' },
  { id: 'sample:boulevard', name: 'Boulevard', src: './samples/boulevard.jpg' },
];

const DEFAULT_STATE = () => ({
  layout: 'hero3',
  grade: 'sunset',
  title: 'SUNSET HEIST',
  subtitle: 'a vice city story',
  badge: 'EST. 2026',
  size: '1080x1080',
  panels: {},
});

export const app = {
  state: DEFAULT_STATE(),
  photos: new Map(),
  selectedPanel: null,
  undoStack: [],
  redoStack: [],
};

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const stageCtx = stage.getContext('2d');

function snapshot() {
  return JSON.stringify(app.state);
}
function pushUndo() {
  app.undoStack.push(snapshot());
  if (app.undoStack.length > 60) app.undoStack.shift();
  app.redoStack.length = 0;
  syncUndoButtons();
}
function applySnapshot(json) {
  app.state = JSON.parse(json);
  syncControls();
  renderPreview();
}
function syncUndoButtons() {
  $('undoBtn').disabled = app.undoStack.length === 0;
  $('redoBtn').disabled = app.redoStack.length === 0;
}

export function sizeOf() {
  return SIZES.find((s) => s.id === app.state.size) || SIZES[0];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load photo'));
    img.src = src;
  });
}

export async function addPhoto(id, src, name) {
  const img = await loadImage(src);
  app.photos.set(id, { id, src, name, img });
  refreshPhotoList();
  return img;
}

export async function addSample(id) {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s || app.photos.has(id)) return;
  await addPhoto(s.id, s.src, s.name);
}

async function addUpload(file) {
  const id = `upload:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
  const url = URL.createObjectURL(file);
  try {
    await addPhoto(id, url, file.name.replace(/\.[^.]+$/, ''));
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('that file is not a readable image');
  }
}

function panelPhotoId(panelId, index) {
  const t = app.state.panels[panelId];
  if (t && t.photo && app.photos.has(t.photo)) return t.photo;
  const ids = [...app.photos.keys()];
  return ids[index % Math.max(1, ids.length)] || null;
}

function renderMap() {
  const m = new Map();
  for (const [id, p] of app.photos) m.set(id, p.img);
  return m;
}

export function renderPreview() {
  const size = sizeOf();
  const wrap = $('stageWrap');
  const maxW = Math.min(wrap.clientWidth - 8, 860);
  const scale = Math.min(maxW / size.w, 560 / size.h);
  const pw = Math.max(120, Math.round(size.w * scale));
  const ph = Math.max(120, Math.round(size.h * scale));
  if (stage.width !== pw || stage.height !== ph) { stage.width = pw; stage.height = ph; }
  const off = document.createElement('canvas');
  off.width = size.w; off.height = size.h;
  renderCover(off.getContext('2d'), size.w, size.h, app.state, renderMap());
  stageCtx.clearRect(0, 0, pw, ph);
  stageCtx.drawImage(off, 0, 0, pw, ph);
  const sel = app.selectedPanel;
  if (sel) {
    const panels = panelsFor(app.state.layout, pw, ph);
    const p = panels.find((x) => x.id === sel);
    if (p) {
      stageCtx.save();
      stageCtx.strokeStyle = '#7df9ff';
      stageCtx.lineWidth = 2;
      stageCtx.setLineDash([8, 6]);
      if (p.kind === 'poly') {
        stageCtx.beginPath();
        stageCtx.moveTo(p.points[0][0], p.points[0][1]);
        for (let i = 1; i < p.points.length; i++) stageCtx.lineTo(p.points[i][0], p.points[i][1]);
        stageCtx.closePath();
      } else {
        stageCtx.strokeRect(p.x, p.y, p.w, p.h);
      }
      stageCtx.stroke();
      stageCtx.restore();
    }
  }
}

export function renderExportCanvas() {
  const size = sizeOf();
  const off = document.createElement('canvas');
  off.width = size.w; off.height = size.h;
  renderCover(off.getContext('2d'), size.w, size.h, app.state, renderMap());
  return off;
}

export function exportPNG() {
  return new Promise((resolve, reject) => {
    renderExportCanvas().toBlob((blob) => {
      if (!blob) return reject(new Error('export failed'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sunset-strip-cover-${app.state.size}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve(blob);
    }, 'image/png');
  });
}

function refreshPhotoList() {
  const list = $('photoList');
  list.innerHTML = '';
  for (const [id, p] of app.photos) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.title = `Use ${p.name} for the selected panel`;
    const im = document.createElement('img');
    im.src = p.src;
    im.alt = p.name;
    const sp = document.createElement('span');
    sp.textContent = p.name;
    b.append(im, sp);
    b.addEventListener('click', () => assignPhotoToSelected(id));
    list.appendChild(b);
  }
  const sel = $('panelPhoto');
  sel.innerHTML = '';
  for (const [id, p] of app.photos) {
    const o = document.createElement('option');
    o.value = id; o.textContent = p.name;
    sel.appendChild(o);
  }
  syncPanelPhotoSelect();
}

function syncPanelPhotoSelect() {
  const sel = $('panelPhoto');
  if (!app.selectedPanel || !sel.options.length) return;
  const panels = panelsFor(app.state.layout, 100, 100);
  const idx = panels.findIndex((p) => p.id === app.selectedPanel);
  sel.value = panelPhotoId(app.selectedPanel, Math.max(0, idx)) || '';
  $('panelLabel').textContent = app.selectedPanel ? `Panel ${app.selectedPanel.slice(1)}` : 'No panel selected';
}

function assignPhotoToSelected(id) {
  if (!app.selectedPanel) {
    // No panel picked: fill every panel with this photo.
    pushUndo();
    for (const p of panelsFor(app.state.layout, 100, 100)) {
      app.state.panels[p.id] = { ...(app.state.panels[p.id] || {}), photo: id };
    }
  } else {
    pushUndo();
    app.state.panels[app.selectedPanel] = { ...(app.state.panels[app.selectedPanel] || {}), photo: id };
  }
  renderPreview();
  syncPanelPhotoSelect();
}

function fillAllPanels(id) {
  pushUndo();
  for (const p of panelsFor(app.state.layout, 100, 100)) {
    app.state.panels[p.id] = { ...(app.state.panels[p.id] || {}), photo: id };
  }
  renderPreview();
}

function buildPickers() {
  const lay = $('layoutPicker');
  for (const l of LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.id = l.id;
    b.textContent = l.name;
    b.addEventListener('click', () => { pushUndo(); app.state.layout = l.id; app.selectedPanel = null; syncPickers(); renderPreview(); });
    lay.appendChild(b);
  }
  const gr = $('gradePicker');
  for (const g of GRADES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pick swatch grade-${g.id}`;
    b.dataset.id = g.id;
    b.textContent = g.name;
    b.addEventListener('click', () => { pushUndo(); app.state.grade = g.id; syncPickers(); renderPreview(); });
    gr.appendChild(b);
  }
  const sz = $('sizePicker');
  for (const s of SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.id = s.id;
    b.textContent = s.name;
    b.addEventListener('click', () => { pushUndo(); app.state.size = s.id; syncPickers(); renderPreview(); });
    sz.appendChild(b);
  }
}

function syncPickers() {
  for (const [id, key] of [['layoutPicker', 'layout'], ['gradePicker', 'grade'], ['sizePicker', 'size']]) {
    for (const b of document.getElementById(id).querySelectorAll('.pick')) {
      b.classList.toggle('active', b.dataset.id === app.state[key]);
    }
  }
}

export function syncControls() {
  $('titleInput').value = app.state.title;
  $('subtitleInput').value = app.state.subtitle;
  $('badgeInput').value = app.state.badge;
  syncPickers();
  syncPanelPhotoSelect();
}

function bindStage() {
  let drag = null;
  const toCover = (e) => {
    const r = stage.getBoundingClientRect();
    const size = sizeOf();
    return [(e.clientX - r.left) * (size.w / r.width), (e.clientY - r.top) * (size.h / r.height)];
  };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    const [x, y] = toCover(e);
    const id = hitPanel(app.state.layout, sizeOf().w, sizeOf().h, x, y);
    app.selectedPanel = id;
    if (id) {
      const t = app.state.panels[id] || {};
      drag = { id, x, y, dx: t.dx || 0, dy: t.dy || 0, moved: false };
      pushUndo();
    }
    syncPanelPhotoSelect();
    renderPreview();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = toCover(e);
    const dx = x - drag.x, dy = y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    const t = app.state.panels[drag.id] || {};
    app.state.panels[drag.id] = { ...t, dx: drag.dx + dx, dy: drag.dy + dy };
    renderPreview();
  });
  stage.addEventListener('pointerup', () => {
    if (drag && !drag.moved) app.undoStack.pop();
    drag = null;
    syncUndoButtons();
  });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!app.selectedPanel) return;
    const t = app.state.panels[app.selectedPanel] || {};
    pushUndo();
    const scale = Math.min(4, Math.max(1, (t.scale || 1) * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    app.state.panels[app.selectedPanel] = { ...t, scale };
    renderPreview();
  }, { passive: false });
}

async function init() {
  buildPickers();
  $('photoInput').addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      try { await addUpload(f); } catch (err) { $('statusLine').textContent = err.message; }
    }
    e.target.value = '';
    renderPreview();
  });
  $('fillAllBtn').addEventListener('click', () => {
    const first = [...app.photos.keys()][0];
    if (first) fillAllPanels(first);
  });
  $('panelPhoto').addEventListener('change', (e) => assignPhotoToSelected(e.target.value));
  $('titleInput').addEventListener('input', (e) => { app.state.title = e.target.value; renderPreview(); });
  $('subtitleInput').addEventListener('input', (e) => { app.state.subtitle = e.target.value; renderPreview(); });
  $('badgeInput').addEventListener('input', (e) => { app.state.badge = e.target.value; renderPreview(); });
  $('exportBtn').addEventListener('click', async () => {
    $('statusLine').textContent = 'Exporting…';
    try {
      await exportPNG();
      $('statusLine').textContent = `Exported sunset-strip-cover-${app.state.size}.png`;
    } catch (err) { $('statusLine').textContent = err.message; }
  });
  $('undoBtn').addEventListener('click', () => {
    if (!app.undoStack.length) return;
    app.redoStack.push(snapshot());
    applySnapshot(app.undoStack.pop());
    syncUndoButtons();
  });
  $('redoBtn').addEventListener('click', () => {
    if (!app.redoStack.length) return;
    app.undoStack.push(snapshot());
    applySnapshot(app.redoStack.pop());
    syncUndoButtons();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); $('undoBtn').click(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); $('redoBtn').click(); }
  });
  bindStage();
  try {
    await Promise.all([document.fonts.load('40px Anton'), document.fonts.load('40px Pacifico')]);
  } catch { /* fall back to system fonts; the cover still renders */ }
  try {
    await addSample('sample:pier');
    await addSample('sample:boulevard');
  } catch { /* samples are optional; uploads still work */ }
  syncControls();
  syncUndoButtons();
  renderPreview();
  document.documentElement.setAttribute('data-editor-ready', '1');
  window.__coverApp = app;
}

init();
