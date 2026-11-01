(() => {
  'use strict';
  // ===== 配置 =====
  const TARGET_TILES = 400;       // 目标碎片数（约 20×20）
  const MAX_IMAGE_SIDE = 1600;    // 导入图片最长边上限（像素），超出自动缩小
  const HISTORY_FRAMES = 600;     // 后悔药历史上限：600 帧 ≈ 10 秒（60 帧/秒）
  const STEP = 1 / 60;            // 固定物理步长
  const GRAVITY = 2200;           // px/s²
  const BOUNCE = 0.42, FRICTION = 0.86;
  const FIELDS = 6;
  const DRAG_THRESHOLD = 8;       // 移动超过 8px 视为拖动，否则视为点击
  const WIND_LOOSEN_SPEED = 1400; // 拖动速度超过此值（px/s）才会掀起完整碎片               // 每块碎片记录 x, y, angle, vx, vy, va

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const dropHint = document.getElementById('dropHint');

  let W = 0, H = 0, dpr = 1;
  let source = null;              // 当前图片（canvas）
  let tiles = [];                 // 碎片
  let tileSize = 0, layout = null;
  let history = null, histHead = 0, histLen = 0;
  let rewinding = false;
  let rings = [], shake = 0;
  let acc = 0, lastT = 0;
  let loadToken = 0;
  let pendingWind = [];           // 待施加的风（在物理步里施加，从而被历史记录）
  let streaks = [];               // 风痕视觉
  const drags = new Map();        // pointerId -> 拖动状态
  const stats = { frames: 0, maxDt: 0, loops: 0 };

  // ===== 图片 & 碎片 =====
  function setSource(img) { source = img; build(); }

  function build() {
    if (!source || !W) return;
    const pad = Math.max(12, Math.min(W, H) * 0.05);
    const s = Math.min((W - pad * 2) / source.width, (H - pad * 2) / source.height);
    const iw = source.width * s, ih = source.height * s;
    tileSize = Math.sqrt(iw * ih / TARGET_TILES);
    const cols = Math.max(1, Math.round(iw / tileSize)), rows = Math.max(1, Math.round(ih / tileSize));
    tileSize = Math.min(iw / cols, ih / rows);
    const dw = cols * tileSize, dh = rows * tileSize;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    // 源图上对应的裁剪尺寸（保持方形）
    const ss = tileSize / s;
    const sox = (source.width - cols * ss) / 2, soy = (source.height - rows * ss) / 2;
    layout = { cols, rows, ox, oy, dw, dh };
    tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const hx = ox + c * tileSize + tileSize / 2, hy = oy + r * tileSize + tileSize / 2;
      tiles.push({ hx, hy, x: hx, y: hy, a: 0, vx: 0, vy: 0, va: 0, loose: false,
        sx: sox + c * ss, sy: soy + r * ss, ss });
    }
    history = new Float32Array(HISTORY_FRAMES * tiles.length * FIELDS);
    histHead = 0; histLen = 0; rings = []; shake = 0; pendingWind = []; streaks = [];
    draw();
  }

  function resetTiles() {
    for (const t of tiles) { t.x = t.hx; t.y = t.hy; t.a = 0; t.vx = t.vy = t.va = 0; t.loose = false; }
    histHead = 0; histLen = 0; rings = []; shake = 0; acc = 0; pendingWind = []; streaks = [];
    draw();
  }

  async function loadFile(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) { flash('仅支持 JPG / PNG / WebP 图片'); return; }
    const token = ++loadToken;
    try {
      const bmp = await decode(file);
      if (token !== loadToken) return; // 更换过快时丢弃旧结果
      const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      setSource(c);
    } catch (e) { console.warn(e); flash('图片无法读取，请换一张试试'); }
  }
  function decode(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode failed')); };
      im.src = url;
    });
  }

  // ===== 打击 =====
  function smashAt(px, py, radius, power) {
    let hit = 0;
    for (const t of tiles) {
      const dx = t.x - px, dy = t.y - py, d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const f = (1 - d / radius) * power + power * 0.25;
      const ang = d > 0.01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
      t.vx += Math.cos(ang) * f + (Math.random() - 0.5) * power * 0.3;
      t.vy += Math.sin(ang) * f - power * (0.35 + Math.random() * 0.35);
      t.va += (Math.random() - 0.5) * 18;
      t.loose = true; hit++;
    }
    if (hit) {
      rings.push({ x: px, y: py, r: 0, max: radius * 1.6, life: 1 });
      if (!reduceMotion.matches) shake = Math.min(1, shake + 0.6);
    }
    return hit;
  }
  function smashAll() {
    if (!layout) return;
    const cx = layout.ox + layout.dw / 2, cy = layout.oy + layout.dh / 2;
    smashAt(cx, cy, Math.hypot(layout.dw, layout.dh), 1500);
  }

  // ===== 风 =====
  function applyWind() {
    if (!pendingWind.length) return;
    const R = tileSize * 3;
    for (const w of pendingWind) {
      const sp = Math.hypot(w.vx, w.vy);
      for (const t of tiles) {
        // 到拖动线段的距离
        const ex = w.x1 - w.x0, ey = w.y1 - w.y0, L2 = ex * ex + ey * ey || 1;
        const u = Math.max(0, Math.min(1, ((t.x - w.x0) * ex + (t.y - w.y0) * ey) / L2));
        const d = Math.hypot(t.x - (w.x0 + ex * u), t.y - (w.y0 + ey * u));
        if (d > R) continue;
        const k = (1 - d / R);
        if (!t.loose) {
          if (sp < WIND_LOOSEN_SPEED || k < 0.4) continue;
          t.loose = true;
        }
        const f = Math.min(1, 0.12 * k);
        t.vx += (w.vx - t.vx) * f; t.vy += (w.vy - t.vy) * f - (t.vy === 0 ? sp * 0.05 * k : 0);
        t.va += (Math.random() - 0.5) * 4 * k;
      }
    }
    pendingWind.length = 0;
  }

  // ===== 物理 =====
  function step() {
    const floor = H, dt = STEP;
    for (const t of tiles) {
      if (!t.loose) continue;
      const half = tileSize / 2;
      t.vy += GRAVITY * dt;
      t.x += t.vx * dt; t.y += t.vy * dt; t.a += t.va * dt;
      if (t.y + half > floor) {
        t.y = floor - half;
        if (Math.abs(t.vy) > 60) { t.vy = -t.vy * BOUNCE; } else { t.vy = 0; }
        t.vx *= FRICTION; t.va *= 0.7;
        if (Math.abs(t.vx) < 2) t.vx = 0;
        if (Math.abs(t.va) < 0.05) t.va = 0;
      }
      if (t.x - half < 0) { t.x = half; t.vx = Math.abs(t.vx) * BOUNCE; }
      if (t.x + half > W) { t.x = W - half; t.vx = -Math.abs(t.vx) * BOUNCE; }
    }
  }
  function anyMoving() {
    for (const t of tiles) if (t.loose && (t.vx || t.vy || t.va)) return true;
    return false;
  }

  // 历史：环形缓冲区，每帧保存所有碎片的状态
  function record() {
    const n = tiles.length, base = histHead * n * FIELDS;
    for (let i = 0; i < n; i++) {
      const t = tiles[i], o = base + i * FIELDS;
      history[o] = t.x; history[o + 1] = t.y; history[o + 2] = t.a;
      history[o + 3] = t.vx; history[o + 4] = t.vy; history[o + 5] = t.va;
    }
    histHead = (histHead + 1) % HISTORY_FRAMES;
    if (histLen < HISTORY_FRAMES) histLen++;
  }
  function rewindOne() {
    if (histLen === 0) return false;
    histHead = (histHead - 1 + HISTORY_FRAMES) % HISTORY_FRAMES; histLen--;
    const n = tiles.length, base = histHead * n * FIELDS;
    for (let i = 0; i < n; i++) {
      const t = tiles[i], o = base + i * FIELDS;
      t.x = history[o]; t.y = history[o + 1]; t.a = history[o + 2];
      t.vx = history[o + 3]; t.vy = history[o + 4]; t.va = history[o + 5];
      const home = Math.abs(t.x - t.hx) < 0.01 && Math.abs(t.y - t.hy) < 0.01 && Math.abs(t.a) < 1e-4;
      // 倒放到最早一帧时，回到原位的碎片静止归位
      if (home && histLen === 0) { t.x = t.hx; t.y = t.hy; t.a = 0; t.vx = t.vy = t.va = 0; t.loose = false; }
      else t.loose = !(home && !t.vx && !t.vy && !t.va);
    }
    return true;
  }

  // ===== 渲染 =====
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#090a10'; ctx.fillRect(0, 0, W, H);
    // 底部网格地面
    ctx.fillStyle = '#ffffff06';
    for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 1, H);
    for (let y = H; y > 0; y -= 32) ctx.fillRect(0, y, W, 1);
    if (shake > 0) {
      const m = shake * shake * 10;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    if (source && layout) {
      const s = tileSize + 0.6, h = s / 2;
      ctx.imageSmoothingEnabled = true;
      // 先画未动的碎片，再画飞散的碎片（在上层）
      for (let pass = 0; pass < 2; pass++) for (const t of tiles) {
        if (t.loose !== (pass === 1)) continue;
        if (!t.loose) { ctx.drawImage(source, t.sx, t.sy, t.ss, t.ss, t.x - h, t.y - h, s, s); continue; }
        const c = Math.cos(t.a), si = Math.sin(t.a);
        ctx.setTransform(dpr * c, dpr * si, -dpr * si, dpr * c, dpr * t.x, dpr * t.y);
        ctx.drawImage(source, t.sx, t.sy, t.ss, t.ss, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const r of rings) {
      ctx.strokeStyle = `rgba(255,210,63,${(r.life * 0.7).toFixed(3)})`;
      ctx.lineWidth = 2 + r.life * 6;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    for (const st of streaks) {
      ctx.strokeStyle = `rgba(61,245,196,${(st.life * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1 + st.life * 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(st.x0, st.y0); ctx.lineTo(st.x1, st.y1); ctx.stroke();
    }
    if (rewinding) {
      ctx.fillStyle = '#ffd23f'; ctx.font = '600 14px system-ui,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`◀◀ 倒放中 · 剩余 ${(histLen / 60).toFixed(1)} 秒`, 14, 26);
    }
  }
  function updateFx() {
    const rm = reduceMotion.matches;
    for (const r of rings) { r.r += (r.max - r.r) * (rm ? 0.3 : 0.14); r.life -= rm ? 0.12 : 0.05; }
    rings = rings.filter(r => r.life > 0);
    if (shake > 0) shake = Math.max(0, shake - 0.08);
    for (const st of streaks) st.life -= 0.06;
    streaks = streaks.filter(st => st.life > 0);
  }

  // ===== 唯一的主循环 =====
  function frame(now) {
    const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : STEP);
    if (lastT) { stats.frames++; if (stats.frames > 5) stats.maxDt = Math.max(stats.maxDt, dt * 1000); }
    lastT = now; acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      acc -= STEP; steps++;
      if (rewinding) { rewindOne(); pendingWind.length = 0; }
      else { applyWind(); if (anyMoving()) { record(); step(); } }
    }
    if (steps === 4) acc = 0;
    updateFx(); draw();
    requestAnimationFrame(frame);
  }

  // ===== 尺寸 =====
  function resize() {
    const r = stage.getBoundingClientRect();
    const nw = Math.round(r.width), nh = Math.round(r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (nw === W && nh === H && canvas.width === Math.round(nw * dpr)) return;
    W = nw; H = nh;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    build(); // 尺寸变化时重新排版（会恢复完整图片）
  }

  // ===== 导出 =====
  function exportPNG() {
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const g = out.getContext('2d', { alpha: false });
    g.fillStyle = '#090a10'; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(canvas, 0, 0);
    out.toBlob(b => {
      if (!b) { flash('导出失败'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `desktop-smasher-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  // ===== 提示 =====
  const hintEl = document.getElementById('hint'), hintText = hintEl.textContent;
  let hintTimer = 0;
  function flash(msg) {
    hintEl.textContent = msg; hintEl.style.color = '#ffd23f';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintEl.textContent = hintText; hintEl.style.color = ''; }, 2500);
  }

  // ===== 事件 =====
  // 点击 = 松开时移动距离 < 阈值 → 局部打碎；拖动 = 超过阈值 → 掀起一阵风
  const local = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', e => {
    if (rewinding) return;
    const [x, y] = local(e);
    drags.set(e.pointerId, { sx: x, sy: y, x, y, t: performance.now(), dragging: false });
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener('pointermove', e => {
    const d = drags.get(e.pointerId);
    if (!d || rewinding) return;
    const [x, y] = local(e), now = performance.now();
    if (!d.dragging && Math.hypot(x - d.sx, y - d.sy) < DRAG_THRESHOLD) return;
    d.dragging = true;
    const dt = Math.max(8, now - d.t) / 1000;
    const vx = Math.max(-4000, Math.min(4000, (x - d.x) / dt)), vy = Math.max(-4000, Math.min(4000, (y - d.y) / dt));
    pendingWind.push({ x0: d.x, y0: d.y, x1: x, y1: y, vx, vy });
    if (!reduceMotion.matches) streaks.push({ x0: d.x, y0: d.y, x1: x, y1: y, life: 1 });
    d.x = x; d.y = y; d.t = now;
  });
  const endDrag = (e, click) => {
    const d = drags.get(e.pointerId);
    drags.delete(e.pointerId);
    if (d && click && !d.dragging && !rewinding) smashAt(d.sx, d.sy, tileSize * 3.2, 650);
  };
  stage.addEventListener('pointerup', e => endDrag(e, true));
  stage.addEventListener('pointercancel', e => endDrag(e, false));
  document.getElementById('btnSmash').addEventListener('click', smashAll);
  document.getElementById('btnReset').addEventListener('click', () => { rewinding = false; resetTiles(); });
  document.getElementById('btnExport').addEventListener('click', exportPNG);
  document.getElementById('fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });

  const rw = document.getElementById('btnRewind');
  const startRw = e => {
    e.preventDefault();
    if (histLen === 0) { flash('还没有可倒放的记录'); return; }
    rewinding = true; rw.classList.add('held');
    if (e.pointerId !== undefined && rw.setPointerCapture) { try { rw.setPointerCapture(e.pointerId); } catch (_) {} }
  };
  const stopRw = () => { rewinding = false; rw.classList.remove('held'); };
  rw.addEventListener('pointerdown', startRw);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => rw.addEventListener(ev, stopRw));
  rw.addEventListener('contextmenu', e => e.preventDefault());
  rw.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startRw(e); });
  rw.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stopRw(); });
  window.addEventListener('blur', stopRw);

  ['dragenter', 'dragover'].forEach(ev => stage.addEventListener(ev, e => {
    e.preventDefault(); stage.classList.add('dragover'); dropHint.hidden = false;
  }));
  ['dragleave', 'drop'].forEach(ev => stage.addEventListener(ev, e => {
    e.preventDefault(); stage.classList.remove('dragover'); dropHint.hidden = true;
  }));
  stage.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  new ResizeObserver(resize).observe(stage);

  // ===== 启动 =====
  resize();
  setSource(window.drawSampleImage(1200, 800));
  stats.loops++;
  requestAnimationFrame(frame);

  // 仅用于自动化测试的只读调试接口
  window.__smasher = {
    get tiles() { return tiles; }, get histLen() { return histLen; }, get rewinding() { return rewinding; }, get streaks() { return streaks.length; },
    get stats() { return stats; }, HISTORY_FRAMES, smashAt, get layout() { return layout; }
  };
})();
