// Controlador de busqueda: pool de Web Workers, reparto de lotes, pausa/reanudacion/cancelacion y estadisticas.
// Mide su propio rendimiento (velocidad, ETA recalculado, carga real de los workers, coste por etapa).
// Todo el estado vive en memoria; al recargar la pagina desaparece.
import { SEARCH_MODES, CALIBRATION_EVERY, CALIBRATION_STORE_CAP } from './configuration.js';
import { randomSeed } from './utilities.js';

export class SearchController {
  constructor(handlers = {}) {
    this.h = handlers;            // { onState, onProgress, onMatches, onError, onCheckpoint }
    this.workers = [];
    this.state = 'idle';          // idle | running | paused | finished | cancelled
    this.reset();
  }
  reset() {
    this.stats = { examined: 0, matches: 0, elapsedMs: 0, speed: 0, avgSpeed: 0, etaMs: null, load: null, calib: { n: 0, leaves: {} }, stages: [], stopReason: null };
    this.domain = null; this.total = null; this._speedWin = []; this._busyMs = 0; this._ema = null;
  }
  _setState(s) { this.state = s; this.h.onState?.(s); }

  /**
   * cfg: { mc, large, rules, mode, domain:{kind:'random'|'range'|'list', ...}, workers, wasmUrl, calibEvery,
   *        maxMatches, maxSeeds, maxTimeMs, checkpointSeeds, stopWhen(snapshot)->bool }
   */
  async start(cfg) {
    this.cancel(true);
    this.reset();
    this.cfg = { calibEvery: CALIBRATION_EVERY, maxMatches: null, maxSeeds: null, maxTimeMs: null, ...cfg };
    this.domain = cfg.domain;
    this._initDomain();
    this._finishing = false; this._index = 0; this._batchId = 0; this._inflight = 0; this._startedAt = null; this._accum = 0; this._checkpointDone = false;
    this._limit = this.cfg.maxSeeds && this.cfg.maxSeeds > 0 ? this.cfg.maxSeeds : Infinity;
    if (Number.isFinite(this._limit)) this.total = this.total === null ? this._limit : Math.min(this.total, this._limit);
    this.workers = [];
    const ready = [];
    for (let i = 0; i < cfg.workers; i++) {
      const w = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => this._onWorker(w, ev.data);
      w.onerror = (ev) => { this.h.onError?.(ev.message || 'Error en un worker'); };
      w.idle = false;
      ready.push(new Promise((res, rej) => { w._ready = res; w._fail = rej; }));
      w.postMessage({ type: 'init', wasmUrl: cfg.wasmUrl, mc: cfg.mc, large: cfg.large, rules: cfg.rules, mode: cfg.mode, calibEvery: this.cfg.calibEvery });
      this.workers.push(w);
    }
    this._setState('running');
    const myWorkers = this.workers;
    try { await Promise.all(ready); } catch (e) { this.h.onError?.(String(e)); this.cancel(); return; }
    if (this.workers !== myWorkers || this.state !== 'running') return; // cancelado durante la carga
    this._startedAt = performance.now();
    this._timer = setInterval(() => this._tick(), 250);
    this.workers.forEach((w) => { w.idle = true; });
    this._dispatch();
  }

  _initDomain() {
    const d = this.domain;
    if (d.kind === 'range') { this._cursor = BigInt(d.start); this._end = BigInt(d.end); this.total = Number(this._end - this._cursor + 1n); }
    else if (d.kind === 'list') { this._list = d.list.map(String); this._li = 0; this.total = this._list.length; }
    else { this._left = d.count > 0 ? d.count : Infinity; this.total = d.count > 0 ? d.count : null; }
  }
  _nextSeeds(n) {
    n = Math.min(n, this._limit - this._index);
    const d = this.domain, out = [];
    if (d.kind === 'range') { while (out.length < n && this._cursor <= this._end) { out.push(String(this._cursor)); this._cursor++; } }
    else if (d.kind === 'list') { while (out.length < n && this._li < this._list.length) out.push(this._list[this._li++]); }
    else { while (out.length < n && this._left > 0) { out.push(String(randomSeed())); this._left--; } }
    return out;
  }
  _exhausted() {
    const d = this.domain;
    if (this._index >= this._limit) return true;
    return d.kind === 'range' ? this._cursor > this._end : d.kind === 'list' ? this._li >= this._list.length : this._left <= 0;
  }

  _dispatch() {
    if (this.state !== 'running') return;
    const batch = SEARCH_MODES[this.cfg.mode].batch;
    for (const w of this.workers) {
      if (!w.idle || this._exhausted()) continue;
      const seeds = this._nextSeeds(batch);
      if (!seeds.length) continue;
      w.idle = false; this._inflight++;
      w.postMessage({ type: 'batch', id: ++this._batchId, seeds, startIndex: this._index });
      this._index += seeds.length;
    }
    if (this._inflight === 0 && this._exhausted()) this._finish('finished', 'budget');
  }

  _onWorker(w, m) {
    if (m.type === 'ready') { w._ready(); return; }
    if (m.type === 'error') { this.h.onError?.(m.message); return; }
    if (m.type !== 'batchDone') return;
    w.idle = true; this._inflight--;
    const s = this.stats;
    s.examined += m.examined; s.matches += m.matches.length; s.calib.n += m.calib.n; this._busyMs += m.ms;
    for (const [id, v] of Object.entries(m.calib.leaves)) {
      const t = (s.calib.leaves[id] ||= { pass: 0, metrics: [] });
      t.pass += v.pass;
      for (const x of v.metrics) { if (t.metrics.length < CALIBRATION_STORE_CAP) t.metrics.push(x); else t.metrics[Math.floor(Math.random() * CALIBRATION_STORE_CAP)] = x; }
    }
    m.stages.forEach((st, i) => { const t = (s.stages[i] ||= { n: 0, k: 0, ms: 0 }); t.n += st.n; t.k += st.k; t.ms += st.ms; });
    if (m.matches.length) this.h.onMatches?.(m.matches);
    if (this.state === 'running') {
      if (this.cfg.maxMatches && s.matches >= this.cfg.maxMatches) { this._finish('finished', 'matches'); return; }
      if (this.cfg.checkpointSeeds && !this._checkpointDone && s.examined >= this.cfg.checkpointSeeds) { this._checkpointDone = true; this.h.onCheckpoint?.(this.snapshot()); }
      if (this.cfg.stopWhen?.(this.snapshot())) { this._finish('finished', 'condition'); return; }
    }
    this.h.onProgress?.(this.snapshot());
    this._dispatch();
  }

  _tick() {
    if (this.state === 'running' && this._startedAt !== null) {
      const now = performance.now();
      this._accum += now - this._startedAt; this._startedAt = now;
      const st = this.stats; st.elapsedMs = this._accum;
      this._speedWin.push([now, st.examined]);
      while (this._speedWin.length > 2 && now - this._speedWin[0][0] > 3000) this._speedWin.shift();
      const a = this._speedWin[0], b = this._speedWin[this._speedWin.length - 1];
      const inst = b[0] > a[0] ? ((b[1] - a[1]) * 1000) / (b[0] - a[0]) : 0;
      st.avgSpeed = st.elapsedMs > 0 ? (st.examined * 1000) / st.elapsedMs : 0;
      this._ema = this._ema === null ? inst : 0.7 * this._ema + 0.3 * inst;   // el ETA se recalcula con la velocidad real reciente
      st.speed = inst;
      const sp = this._ema > 0 ? this._ema : st.avgSpeed;
      st.etaMs = this.total && sp > 0 ? Math.max(0, ((this.total - st.examined) / sp) * 1000) : null;
      if (this.cfg.maxTimeMs) { const left = Math.max(0, this.cfg.maxTimeMs - st.elapsedMs); st.etaMs = st.etaMs === null ? left : Math.min(st.etaMs, left); }
      st.load = st.elapsedMs > 0 && this.workers.length ? Math.min(1, this._busyMs / (st.elapsedMs * this.workers.length)) : null; // tiempo ocupado medido de los workers
      this.h.onProgress?.(this.snapshot());
      if (this.cfg.maxTimeMs && st.elapsedMs >= this.cfg.maxTimeMs) this._finish('finished', 'time');
    }
  }
  snapshot() {
    return { ...this.stats, discarded: this.stats.examined - this.stats.matches, total: this.total, state: this.state, domain: this.domain, workers: this.workers.length };
  }
  pause() { if (this.state === 'running') { this._tick(); this._startedAt = null; this._setState('paused'); } }
  resume() { if (this.state === 'paused') { this._startedAt = performance.now(); this._speedWin = []; this._setState('running'); this._dispatch(); } }
  _finish(final, reason) {
    if (this._finishing || this.state === 'finished' || this.state === 'cancelled') return;
    this._finishing = true;
    clearInterval(this._timer); this._tick();
    this.stats.stopReason = reason || null;
    this.workers.forEach((w) => w.terminate()); this.workers = [];
    this._setState(final); this.h.onProgress?.(this.snapshot());
  }
  /** Cancelacion inmediata: termina los workers sin esperar a que acaben su lote. */
  cancel(silent = false) {
    clearInterval(this._timer);
    this.workers.forEach((w) => w.terminate()); this.workers = [];
    if (!silent && (this.state === 'running' || this.state === 'paused')) { this.stats.stopReason = 'manual'; this._setState('cancelled'); this.h.onProgress?.(this.snapshot()); }
  }
}

/**
 * Piloto de medicion: ejecuta la regla sobre semillas aleatorias durante `timeMs` (o hasta tener `minK` aciertos en cada
 * etapa alcanzada) en workers propios. Devuelve estadisticas por etapa y velocidad medida. No guarda las semillas.
 */
export function runPilot(base, { timeMs = 8000, minK = 40, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const ctl = new SearchController({
      onProgress: (s) => onProgress?.(s),
      onError: (m) => { ctl.cancel(true); reject(new Error(m)); },
    });
    const finishUp = () => resolve({ stages: ctl.stats.stages, speed: ctl.stats.avgSpeed || ctl.stats.speed, examined: ctl.stats.examined, elapsedMs: ctl.stats.elapsedMs, matches: ctl.stats.matches, calib: ctl.stats.calib, workers: base.workers, aborted: !!signal?.aborted });
    ctl.h.onState = (s) => { if (s === 'finished' || s === 'cancelled') finishUp(); };
    signal?.addEventListener('abort', () => ctl.cancel());
    ctl.start({
      ...base, domain: { kind: 'random', count: 0 }, maxMatches: null, maxSeeds: null, maxTimeMs: timeMs, calibEvery: 6,
      stopWhen: (s) => s.stages.length > 0 && s.stages.every((st) => st.k >= minK),
    });
  });
}

/** Cliente simple para el mapa: un worker propio, peticiones con id. */
export class MapWorker {
  constructor(wasmUrl, mc, large) {
    this.w = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
    this.pending = new Map(); this.seq = 0; this.mc = mc; this.large = large;
    this.ready = new Promise((res, rej) => { this._res = res; this._rej = rej; });
    this.w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') this._res();
      else if (m.reqId && this.pending.has(m.reqId)) { const p = this.pending.get(m.reqId); this.pending.delete(m.reqId); m.type === 'error' ? p.rej(new Error(m.message)) : p.res(m); }
      else if (m.type === 'error') this._rej(new Error(m.message));
    };
    this.w.postMessage({ type: 'init', wasmUrl, mc, large, rules: null, mode: 'normal', calibEvery: 1 });
  }
  request(msg) {
    return this.ready.then(() => new Promise((res, rej) => { const reqId = ++this.seq; this.pending.set(reqId, { res, rej }); this.w.postMessage({ ...msg, reqId, mc: this.mc, large: this.large }); }));
  }
  terminate() { this.w.terminate(); }
}
