// Mapa interactivo. Todos los datos (biomas, estructuras, spawn) proceden del motor WebAssembly para la semilla indicada.
// Cofres: no disponibles (ver loot-engine.js). Las estructuras se dibujan por su punto de inicio, no por su geometria.
import { biomeColorRGB, biomeName } from './biome-engine.js';
import { STRUCTURES, structById, DIM_NAMES } from './structure-engine.js';
import { dist, fmtInt } from './utilities.js';

const SCALES = [1, 4, 16, 64, 256];
const MARK = { Village: '#ffd166', Mansion: '#b5651d', Ancient_City: '#3fb6c9', stronghold: '#ff5d5d', Trial_Chambers: '#e0a0ff', Monument: '#5ec2ff', Outpost: '#c0392b', Fortress: '#ff7a3d', Bastion: '#8d6e63', End_City: '#f2e394' };

export class SeedMap {
  constructor(canvas, worker, hooks = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.w = worker; this.hooks = hooks;
    this.view = { cx: 0, cz: 0, bpp: 4 }; this.dim = 0; this.seed = null; this.spawn = null;
    this.layers = { biomes: true, structures: new Set(), spawn: true, zones: true };
    this.zones = []; this.structs = []; this.measure = []; this.tool = 'select'; this.sel = null;
    this._req = 0; this._img = null; this._imgInfo = null; this._sreq = 0;
    this._bind();
  }
  setSeed(seed) { this.seed = String(seed); this.view = { cx: 0, cz: 0, bpp: 4 }; this.measure = []; this.sel = null; this.refresh(); }
  setDim(d) { this.dim = d; this.refresh(); }
  resize() { const r = this.c.getBoundingClientRect(); this.c.width = Math.max(200, Math.floor(r.width)); this.c.height = Math.max(200, Math.floor(r.height)); this.refresh(); }

  toWorld(px, py) { return { x: this.view.cx + (px - this.c.width / 2) * this.view.bpp, z: this.view.cz + (py - this.c.height / 2) * this.view.bpp }; }
  toScreen(x, z) { return { x: (x - this.view.cx) / this.view.bpp + this.c.width / 2, y: (z - this.view.cz) / this.view.bpp + this.c.height / 2 }; }

  async refresh() {
    if (this.seed === null) { this.draw(); return; }
    const id = ++this._req, { bpp } = this.view, W = this.c.width, H = this.c.height;
    let s = SCALES.find((v) => v / bpp >= 3) || 256;
    const x0 = Math.floor((this.view.cx - (W / 2) * bpp) / s) - 1, z0 = Math.floor((this.view.cz - (H / 2) * bpp) / s) - 1;
    const w = Math.ceil((W * bpp) / s) + 3, h = Math.ceil((H * bpp) / s) + 3;
    this.hooks.onStatus?.('Generando…');
    try {
      if (this.layers.biomes) {
        const r = await this.w.request({ type: 'area', seed: this.seed, dim: this.dim, scale: s, x: x0, z: z0, w, h });
        if (id !== this._req) return;
        const img = new ImageData(w, h);
        for (let i = 0; i < r.data.length; i++) { const [R, G, B] = biomeColorRGB(r.data[i]); img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = 255; }
        const off = document.createElement('canvas'); off.width = w; off.height = h; off.getContext('2d').putImageData(img, 0, 0);
        this._img = off; this._imgInfo = { x0, z0, s, w, h, data: r.data }; this.spawn = r.spawn;
      } else { this._img = null; this._imgInfo = null; }
      await this._loadStructures(id);
      this.hooks.onStatus?.(`Escala ${s} bloques/celda · ${fmtInt(W * bpp)} × ${fmtInt(H * bpp)} bloques visibles`);
    } catch (e) { this.hooks.onStatus?.('Error: ' + e.message); }
    this.draw();
  }
  async _loadStructures(id) {
    this.structs = [];
    const types = [...this.layers.structures].filter((t) => structById(t)?.dim === this.dim);
    if (!types.length) return;
    const { bpp, cx, cz } = this.view, W = this.c.width * bpp, H = this.c.height * bpp;
    if (Math.max(W, H) > 9000) { this.hooks.onStatus?.('Acércate para ver estructuras (vista demasiado amplia).'); return; }
    const r = await this.w.request({ type: 'structures', seed: this.seed, dim: this.dim, types, x0: cx - W / 2, z0: cz - H / 2, x1: cx + W / 2, z1: cz + H / 2, verify: true });
    if (id !== this._req) return;
    this.structs = r.list.filter((p) => !p.truncated);
  }

  draw() {
    const { ctx, c } = this; ctx.fillStyle = '#0b1117'; ctx.fillRect(0, 0, c.width, c.height);
    if (this._img && this._imgInfo) {
      const { x0, z0, s, w, h } = this._imgInfo, a = this.toScreen(x0 * s, z0 * s), size = s / this.view.bpp;
      ctx.imageSmoothingEnabled = false; ctx.drawImage(this._img, a.x, a.y, w * size, h * size);
    }
    this._grid();
    if (this.layers.zones) for (const z of this.zones) { const p = this.toScreen(z.cx, z.cz); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, z.r / this.view.bpp, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(z.label, p.x + 4, p.y - z.r / this.view.bpp - 4); }
    for (const p of this.structs) {
      const sd = structById(p.id), s = this.toScreen(p.x, p.z); ctx.fillStyle = MARK[sd.key] || '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(s.x - 5, s.y - 5, 10, 10); ctx.fill(); ctx.stroke();
      if (this.sel === p) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(s.x - 9, s.y - 9, 18, 18); }
    }
    if (this.layers.spawn && this.dim === 0 && this.spawn) { const p = this.toScreen(this.spawn.x, this.spawn.z); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('SPAWN', p.x + 9, p.y + 4); }
    if (this.measure.length) {
      ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.beginPath();
      this.measure.forEach((m, i) => { const p = this.toScreen(m.x, m.z); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke();
      this.measure.forEach((m) => { const p = this.toScreen(m.x, m.z); ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); });
    }
  }
  _grid() {
    const { ctx, c } = this, step = [16, 64, 256, 512, 1024, 2048, 4096, 8192].find((s) => s / this.view.bpp >= 90) || 8192;
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '10px sans-serif'; ctx.lineWidth = 1;
    const a = this.toWorld(0, 0), b = this.toWorld(c.width, c.height);
    for (let x = Math.ceil(a.x / step) * step; x < b.x; x += step) { const p = this.toScreen(x, 0); ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, c.height); ctx.stroke(); ctx.fillText(x, p.x + 2, 10); }
    for (let z = Math.ceil(a.z / step) * step; z < b.z; z += step) { const p = this.toScreen(0, z); ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(c.width, p.y); ctx.stroke(); ctx.fillText(z, 2, p.y - 2); }
  }

  biomeAtWorld(x, z) {
    const i = this._imgInfo; if (!i) return null;
    const cx = Math.floor(x / i.s) - i.x0, cz = Math.floor(z / i.s) - i.z0;
    return cx >= 0 && cz >= 0 && cx < i.w && cz < i.h ? i.data[cz * i.w + cx] : null;
  }

  _bind() {
    const c = this.c; let drag = null, moved = false; const ptrs = new Map(); let pinch = null;
    const toPx = (e) => { const r = c.getBoundingClientRect(); return { px: (e.clientX - r.left) * (c.width / r.width), py: (e.clientY - r.top) * (c.height / r.height), sx: c.width / r.width }; };
    c.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), bpp: this.view.bpp }; drag = null; moved = true; }
      else { drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz }; moved = false; }
    });
    c.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (!(d > 0)) return;
        const r = c.getBoundingClientRect(), mx = ((a.x + b.x) / 2 - r.left) * (c.width / r.width), my = ((a.y + b.y) / 2 - r.top) * (c.height / r.height), before = this.toWorld(mx, my);
        this.view.bpp = Math.min(512, Math.max(0.25, pinch.bpp * (pinch.d / d)));
        const after = this.toWorld(mx, my); this.view.cx += before.x - after.x; this.view.cz += before.z - after.z; this.draw(); return;
      }
      const { px, py, sx } = toPx(e), w = this.toWorld(px, py), b = this.biomeAtWorld(w.x, w.z);
      this.hooks.onHover?.({ x: Math.round(w.x), z: Math.round(w.z), biome: b === null ? null : biomeName(b), dim: DIM_NAMES[this.dim] });
      if (drag) { const dx = (e.clientX - drag.x) * sx, dy = (e.clientY - drag.y) * sx; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; this.view.cx = drag.cx - dx * this.view.bpp; this.view.cz = drag.cz - dy * this.view.bpp; this.draw(); }
    });
    const up = (e) => {
      const { px, py } = toPx(e); ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) { pinch = null; this.refresh(); } if (!ptrs.size) { drag = null; } return; }
      if (drag && moved) this.refresh(); else if (drag && e.type === 'pointerup') this._click(px, py);
      drag = null;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) * (c.width / r.width), py = (e.clientY - r.top) * (c.height / r.height), before = this.toWorld(px, py);
      this.view.bpp = Math.min(512, Math.max(0.25, this.view.bpp * (e.deltaY > 0 ? 1.25 : 0.8)));
      const after = this.toWorld(px, py); this.view.cx += before.x - after.x; this.view.cz += before.z - after.z;
      this.draw(); clearTimeout(this._wt); this._wt = setTimeout(() => this.refresh(), 160);
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(c);
  }
  _click(px, py) {
    const w = this.toWorld(px, py);
    if (this.tool === 'measure') { if (this.measure.length >= 2) this.measure = []; this.measure.push({ x: w.x, z: w.z }); this.draw(); this.hooks.onMeasure?.(this.measure.length === 2 ? dist(this.measure[0].x, this.measure[0].z, this.measure[1].x, this.measure[1].z) : null); return; }
    let best = null, bd = 12;
    for (const p of this.structs) { const s = this.toScreen(p.x, p.z), d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = p; } }
    this.sel = best; this.draw();
    this.hooks.onSelect?.(best ? { ...best, label: structById(best.id).label, dSpawn: this.spawn ? dist(best.x, best.z, this.spawn.x, this.spawn.z) : null } : null);
  }
  zoom(f) { this.view.bpp = Math.min(512, Math.max(0.25, this.view.bpp * f)); this.refresh(); }
  goto(x, z) { this.view.cx = x; this.view.cz = z; this.refresh(); }
}
export { STRUCTURES };
