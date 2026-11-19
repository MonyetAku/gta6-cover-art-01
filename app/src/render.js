// Sunset Strip cover renderer — draws a multi-panel GTA-style poster cover on a 2D canvas.
// Everything here is original work: the layouts, colour grades and lettering are drawn from
// code. No Rockstar Games logo, artwork or font is used anywhere. Lettering uses Anton and
// Pacifico, both shipped under the SIL Open Font License (see app/fonts/OFL.txt).

export const LAYOUTS = [
  { id: 'hero3', name: 'Hero + Three' },
  { id: 'grid4', name: 'Four Panel' },
  { id: 'fullbleed', name: 'Full Bleed' },
  { id: 'grid9', name: 'Nine Panel' },
  { id: 'tilt', name: 'Tilted Snaps' },
  { id: 'split', name: 'Split Frame' },
];

export const GRADES = [
  { id: 'sunset', name: 'Sunset' },
  { id: 'neon', name: 'Neon Night' },
  { id: 'vice', name: 'Vice Purple' },
  { id: 'gold', name: 'Golden Hour' },
  { id: 'noir', name: 'Noir Teal' },
  { id: 'mono', name: 'Mono Cream' },
];

export const SIZES = [
  { id: '1080x1080', w: 1080, h: 1080, name: 'Square · 1080 × 1080' },
  { id: '1080x1350', w: 1080, h: 1350, name: 'Portrait · 1080 × 1350' },
  { id: '1920x1080', w: 1920, h: 1080, name: 'Wide · 1920 × 1080' },
  { id: '1080x1920', w: 1080, h: 1920, name: 'Story · 1080 × 1920' },
];

// Panel geometry for a layout. Each panel is a rect (x, y, w, h, optional rot in radians
// around its centre) or a polygon ({ points: [[x, y], ...] }). Coordinates are in cover pixels.
export function panelsFor(layout, W, H) {
  const m = Math.round(W * 0.028);
  const g = Math.round(W * 0.014);
  const R = (id, x, y, w, h, rot = 0) => ({ id, kind: 'rect', x, y, w, h, rot });
  switch (layout) {
    case 'grid4': {
      const cw = (W - 2 * m - g) / 2, ch = (H - 2 * m - g) / 2;
      return [
        R('p0', m, m, cw, ch), R('p1', m + cw + g, m, cw, ch),
        R('p2', m, m + ch + g, cw, ch), R('p3', m + cw + g, m + ch + g, cw, ch),
      ];
    }
    case 'hero3': {
      const hw = (W - 2 * m) * 0.6;
      const rx = m + hw + g, rw = W - m - rx;
      const rh = (H - 2 * m - 2 * g) / 3;
      return [
        R('p0', m, m, hw, H - 2 * m),
        R('p1', rx, m, rw, rh), R('p2', rx, m + rh + g, rw, rh),
        R('p3', rx, m + 2 * (rh + g), rw, rh),
      ];
    }
    case 'fullbleed':
      return [R('p0', 0, 0, W, H)];
    case 'grid9': {
      const cw = (W - 2 * m - 2 * g) / 3, ch = (H - 2 * m - 2 * g) / 3;
      const out = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        out.push(R(`p${r * 3 + c}`, m + c * (cw + g), m + r * (ch + g), cw, ch));
      }
      return out;
    }
    case 'tilt':
      return [
        R('p0', W * 0.06, H * 0.07, W * 0.56, H * 0.60, -0.07),
        R('p1', W * 0.60, H * 0.05, W * 0.34, H * 0.42, 0.05),
        R('p2', W * 0.58, H * 0.52, W * 0.36, H * 0.40, -0.04),
      ];
    case 'split':
      return [
        { id: 'p0', kind: 'poly', points: [[0, 0], [W, 0], [0, H]] },
        { id: 'p1', kind: 'poly', points: [[W, 0], [W, H], [0, H]] },
      ];
    default:
      return panelsFor('hero3', W, H);
  }
}

function panelPath(ctx, p) {
  ctx.beginPath();
  if (p.kind === 'poly') {
    ctx.moveTo(p.points[0][0], p.points[0][1]);
    for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i][0], p.points[i][1]);
    ctx.closePath();
  } else if (p.rot) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.rot);
    ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  } else {
    ctx.rect(p.x, p.y, p.w, p.h);
  }
}

function panelCenter(p) {
  if (p.kind === 'poly') {
    let x = 0, y = 0;
    for (const [px, py] of p.points) { x += px; y += py; }
    return [x / p.points.length, y / p.points.length];
  }
  return [p.x + p.w / 2, p.y + p.h / 2];
}

function panelBounds(p) {
  if (p.kind === 'poly') {
    const xs = p.points.map(([x]) => x), ys = p.points.map(([, y]) => y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

// Draw an image cover-fitting a rect, with a per-panel zoom and pan (in cover pixels).
function drawPhotoCover(ctx, img, x, y, w, h, scale, dx, dy) {
  const ir = img.naturalWidth / img.naturalHeight, r = w / h;
  let dw, dh;
  if (ir > r) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  dw *= scale; dh *= scale;
  ctx.drawImage(img, x + (w - dw) / 2 + dx, y + (h - dh) / 2 + dy, dw, dh);
}

function applyGrade(ctx, b, grade) {
  const grad = (c1, c2) => {
    const gr = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.25, b.y + b.h);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    return gr;
  };
  const wash = (style, op, mode) => {
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = op;
    ctx.fillStyle = style;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  };
  switch (grade) {
    case 'neon':
      wash(grad('#00e5ff', '#ff2fb3'), 0.32, 'overlay');
      wash('#12002e', 0.15, 'multiply');
      break;
    case 'vice':
      wash(grad('#7b2ff7', '#ff9a3c'), 0.30, 'overlay');
      wash('#1b0533', 0.20, 'soft-light');
      break;
    case 'gold':
      wash(grad('#ffd76a', '#ff7b00'), 0.30, 'overlay');
      wash('#fff3b0', 0.12, 'screen');
      break;
    case 'noir':
      wash('#0f2027', 0.30, 'multiply');
      wash(grad('#2c5364', '#0f2027'), 0.25, 'overlay');
      break;
    case 'mono':
      wash('#808080', 1, 'saturation');
      wash('#f5f0e6', 0.10, 'overlay');
      break;
    case 'sunset':
    default:
      wash(grad('#ff8a00', '#ff2e88'), 0.30, 'overlay');
      wash('#2b0a4a', 0.18, 'soft-light');
      break;
  }
}

let noiseCanvas = null;
function grain(ctx, W, H) {
  if (!noiseCanvas) {
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 140; noiseCanvas.height = 140;
    const nctx = noiseCanvas.getContext('2d');
    const img = nctx.createImageData(140, 140);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + Math.floor(Math.random() * 40);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = ctx.createPattern(noiseCanvas, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function vignette(ctx, W, H) {
  const r = Math.max(W, H) * 0.72;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
  g.addColorStop(0, 'rgba(8,2,18,0)');
  g.addColorStop(1, 'rgba(8,2,18,0.40)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function halftone(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  const step = Math.max(10, w * 0.014);
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      const t = 1 - (xx - x) / w;
      ctx.beginPath();
      ctx.arc(xx, yy, Math.max(0.6, step * 0.16 * (0.4 + t)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawTitleBlock(ctx, W, H, state) {
  const tb = H * (W >= H * 1.4 ? 0.27 : 0.21);
  const y0 = H - tb;
  const band = ctx.createLinearGradient(0, y0, 0, H);
  band.addColorStop(0, 'rgba(14,4,26,0.62)');
  band.addColorStop(1, 'rgba(14,4,26,0.92)');
  ctx.fillStyle = band;
  ctx.fillRect(0, y0, W, tb);
  const accent = ctx.createLinearGradient(0, 0, W, 0);
  accent.addColorStop(0, '#ffe259'); accent.addColorStop(0.5, '#ffa751'); accent.addColorStop(1, '#ff2e88');
  ctx.fillStyle = accent;
  ctx.fillRect(0, y0, W, Math.max(3, H * 0.004));
  halftone(ctx, 0, y0, W, tb);

  const pad = W * 0.035;
  const title = (state.title || 'SUNSET STRIP').toUpperCase();
  const sub = state.subtitle || '';
  let fs = Math.min(W * 0.105, (tb * 0.52));
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Shrink the title until it fits the band, so a long caption never overflows.
  for (;;) {
    ctx.font = `${Math.round(fs)}px Anton, sans-serif`;
    if (ctx.measureText(title).width <= W - 2 * pad || fs <= W * 0.045) break;
    fs *= 0.92;
  }
  const tx = pad, ty = y0 + tb * 0.62;
  const grad = ctx.createLinearGradient(0, ty - fs, 0, ty + fs * 0.15);
  grad.addColorStop(0, '#ffe259'); grad.addColorStop(0.55, '#ffa751'); grad.addColorStop(1, '#ff5e8a');
  ctx.font = `${Math.round(fs)}px Anton, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#160a24';
  ctx.lineWidth = Math.max(3, fs * 0.07);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = fs * 0.10;
  ctx.shadowOffsetY = fs * 0.03;
  ctx.strokeText(title, tx, ty);
  ctx.fillStyle = grad;
  ctx.fillText(title, tx, ty);
  ctx.restore();

  if (sub) {
    const sfs = Math.min(W * 0.042, tb * 0.26);
    ctx.save();
    ctx.font = `${Math.round(sfs)}px Pacifico, cursive`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7df9ff';
    ctx.shadowColor = '#ff2fb3';
    ctx.shadowBlur = sfs * 0.55;
    ctx.fillText(sub, pad, y0 + tb * 0.88);
    ctx.restore();
  }
}

function drawBadge(ctx, W, H, state) {
  const label = (state.badge || '').trim();
  if (!label) return;
  const fs = Math.max(14, W * 0.020);
  ctx.save();
  ctx.font = `${Math.round(fs)}px Anton, sans-serif`;
  const tw = ctx.measureText(label.toUpperCase()).width;
  const bw = tw + fs * 1.6, bh = fs * 1.9;
  const x = W - bw - W * 0.028, y = H * 0.028;
  ctx.translate(x + bw / 2, y + bh / 2);
  ctx.rotate(0.05);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ff2fb3';
  roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x + bw / 2, y + bh / 2);
  ctx.rotate(0.05);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.5, W * 0.0016);
  roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(fs)}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 0, fs * 0.06);
  ctx.restore();
}

// state: { layout, grade, title, subtitle, badge, panels: { [panelId]: { photo, scale, dx, dy } } }
// photos: Map of photoId -> HTMLImageElement. Panel photo defaults to photos in order.
export function renderCover(ctx, W, H, state, photos) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#14081f';
  ctx.fillRect(0, 0, W, H);
  const panels = panelsFor(state.layout, W, H);
  const ids = [...photos.keys()];
  panels.forEach((p, i) => {
    const t = (state.panels && state.panels[p.id]) || {};
    const photoId = t.photo ?? ids[i % Math.max(1, ids.length)];
    const img = photos.get(photoId);
    const b = panelBounds(p);
    ctx.save();
    panelPath(ctx, p);
    ctx.clip();
    if (img) {
      if (p.rot) {
        const [cx, cy] = panelCenter(p);
        ctx.translate(cx, cy);
        ctx.rotate(p.rot);
        drawPhotoCover(ctx, img, -b.w / 2, -b.h / 2, b.w, b.h, t.scale || 1, t.dx || 0, t.dy || 0);
        ctx.rotate(-p.rot);
        ctx.translate(-cx, -cy);
      } else {
        drawPhotoCover(ctx, img, b.x, b.y, b.w, b.h, t.scale || 1, t.dx || 0, t.dy || 0);
      }
    } else {
      ctx.fillStyle = '#2a1140';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    applyGrade(ctx, b, state.grade);
    ctx.restore();
    // Frame: ink line for every panel; tilted panels get a white photo-print border.
    ctx.save();
    if (p.rot) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = W * 0.02;
      ctx.shadowOffsetY = W * 0.008;
    }
    panelPath(ctx, p);
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.strokeStyle = p.rot ? '#f8f2e8' : '#0d0518';
    ctx.stroke();
    ctx.restore();
  });
  if (state.layout === 'split') {
    ctx.save();
    ctx.strokeStyle = '#f8f2e8';
    ctx.lineWidth = Math.max(4, W * 0.006);
    ctx.beginPath();
    ctx.moveTo(W, 0); ctx.lineTo(0, H);
    ctx.stroke();
    ctx.restore();
  }
  drawTitleBlock(ctx, W, H, state);
  drawBadge(ctx, W, H, state);
  grain(ctx, W, H);
  vignette(ctx, W, H);
}

// Hit-test a point (cover pixels) against the layout; returns the panel id or null.
export function hitPanel(layout, W, H, x, y) {
  const panels = panelsFor(layout, W, H);
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.kind === 'poly') {
      const [x0, y0] = [x, y];
      let inside = false;
      const pts = p.points;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [ax, ay] = pts[a], [bx, by] = pts[b];
        if ((ay > y0) !== (by > y0) && x0 < ((bx - ax) * (y0 - ay)) / (by - ay) + ax) inside = !inside;
      }
      if (inside) return p.id;
    } else if (p.rot) {
      const [cx, cy] = panelCenter(p);
      const dx = x - cx, dy = y - cy;
      const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(lx) <= p.w / 2 && Math.abs(ly) <= p.h / 2) return p.id;
    } else if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      return p.id;
    }
  }
  return null;
}
