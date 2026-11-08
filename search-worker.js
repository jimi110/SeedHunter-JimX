// Worker de busqueda (modulo). Cada worker tiene su propia instancia de WebAssembly.
// Mensajes: init | batch | area | structures. Nada se persiste; todo viaja por postMessage.
import { WasmEngine } from './wasm-engine.js';
import { compileRules, evaluateSeed, makeContext, scanStructure, stagesOf } from './search-engine.js';
import { structById } from './structure-engine.js';

let engine = null, compiled = null, cfg = null, curMc = null;

function ensureVersion(mc, large = false) {
  if (curMc !== `${mc}/${large}`) { engine.setup(mc, large); curMc = `${mc}/${large}`; }
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      engine = await WasmEngine.load(m.wasmUrl);
      cfg = m; ensureVersion(m.mc, m.large);
      if (m.rules) compiled = compileRules(m.rules);
      self.postMessage({ type: 'ready', wasm: m.wasmUrl });
    } else if (m.type === 'batch') {
      const t0 = performance.now(), matches = [], calib = { n: 0, leaves: {} };
      const stages = stagesOf(compiled).map(() => ({ n: 0, k: 0, ms: 0 }));
      for (let i = 0; i < m.seeds.length; i++) {
        const seed = BigInt(m.seeds[i]);
        const isCalib = (m.startIndex + i) % cfg.calibEvery === 0;
        const r = evaluateSeed(engine, compiled, seed, cfg.mode, isCalib, stages);
        if (isCalib) {
          calib.n++;
          for (const [id, v] of Object.entries(r.leaves)) {
            const s = (calib.leaves[id] ||= { pass: 0, metrics: [] });
            if (v.pass) s.pass++;
            if (v.metric !== null && v.metric !== undefined) s.metrics.push(v.metric);
          }
        }
        if (r.pass) matches.push(r.record);
      }
      self.postMessage({ type: 'batchDone', id: m.id, examined: m.seeds.length, matches, calib, stages, ms: performance.now() - t0 });
    } else if (m.type === 'area') {
      ensureVersion(m.mc, m.large); engine.apply(m.dim, BigInt(m.seed));
      const data = engine.area(m.scale, m.x, m.z, m.w, m.h);
      const sp = m.dim === 0 ? engine.spawn() : null;
      self.postMessage({ type: 'area', reqId: m.reqId, data, spawn: sp }, [data.buffer]);
    } else if (m.type === 'structures') {
      ensureVersion(m.mc, m.large);
      const ctx = makeContext(engine, BigInt(m.seed), m.verify === false ? 'fast' : 'normal');
      const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2, r = Math.hypot(m.x1 - m.x0, m.z1 - m.z0) / 2;
      const out = [];
      for (const id of m.types) {
        const sdef = structById(id); if (!sdef || sdef.dim !== m.dim) continue;
        if (sdef.special) { if (m.dim === 0) { ctx.ensureDim(0); for (const p of ctx.strongholds()) if (p.x >= m.x0 && p.x <= m.x1 && p.z >= m.z0 && p.z <= m.z1) out.push({ id, x: p.x, z: p.z, verified: 'bioma' }); } continue; }
        const res = scanStructure(ctx, sdef, cx, cz, r);
        for (const p of res.found) if (p.x >= m.x0 && p.x <= m.x1 && p.z >= m.z0 && p.z <= m.z1) out.push({ id, x: p.x, z: p.z, verified: p.verified });
        if (res.truncated) out.push({ id, truncated: true });
      }
      self.postMessage({ type: 'structures', reqId: m.reqId, list: out });
    }
  } catch (err) {
    self.postMessage({ type: 'error', reqId: m.reqId, message: String(err && err.message || err) });
  }
};
