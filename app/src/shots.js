// Screenshot scenes for Sunset Strip: ?shot=cover renders one exported cover full-frame,
// ?shot=editor opens the editor with a sample photo loaded. The cover is drawn by the app's
// own renderer, exactly as the export button draws it — never edited or composited.

import { app, sizeOf, renderPreview, renderExportCanvas, addSample, syncControls } from './editor.js';

function waitEditorReady() {
  return new Promise((resolve) => {
    if (document.documentElement.getAttribute('data-editor-ready') === '1') return resolve();
    const obs = new MutationObserver(() => {
      if (document.documentElement.getAttribute('data-editor-ready') === '1') {
        obs.disconnect();
        resolve();
      }
    });
    obs.observe(document.documentElement, { attributes: true });
  });
}

function applyParams(q) {
  const map = { layout: 'layout', grade: 'grade', title: 'title', subtitle: 'subtitle', badge: 'badge', size: 'size' };
  for (const [param, key] of Object.entries(map)) {
    if (q.has(param)) app.state[key] = q.get(param);
  }
  if (q.get('panels')) {
    try {
      const spec = JSON.parse(q.get('panels'));
      for (const [id, t] of Object.entries(spec)) app.state.panels[id] = t;
    } catch { /* a bad panels param just keeps the defaults */ }
  }
}

async function ensurePhoto(name) {
  const id = `sample:${name}`;
  if (!app.photos.has(id)) await addSample(id);
  return id;
}

async function shotCover(q) {
  document.body.classList.add('shot-cover');
  await ensurePhoto(q.get('photo') || 'pier');
  applyParams(q);
  const size = sizeOf();
  const stage = document.getElementById('stage');
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / size.w, vh / size.h);
  stage.width = Math.round(size.w * scale);
  stage.height = Math.round(size.h * scale);
  const off = renderExportCanvas();
  const ctx = stage.getContext('2d');
  ctx.drawImage(off, 0, 0, stage.width, stage.height);
  document.documentElement.setAttribute('data-shot-ready', '1');
}

async function shotEditor(q) {
  await ensurePhoto(q.get('photo') || 'boulevard');
  applyParams(q);
  syncControls();
  renderPreview();
  document.documentElement.setAttribute('data-shot-ready', '1');
}

async function main() {
  const q = new URLSearchParams(location.search);
  if (!q.get('shot')) return;
  await waitEditorReady();
  try {
    await document.fonts.ready;
  } catch { /* render with fallback fonts if the OFL fonts fail to load */ }
  if (q.get('shot') === 'cover') await shotCover(q);
  else if (q.get('shot') === 'editor') await shotEditor(q);
}

main();
