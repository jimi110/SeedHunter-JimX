// Motor de busqueda: evalua un arbol de reglas (AND/OR/NOT) sobre una semilla usando el motor WebAssembly.
// No depende del DOM: se usa dentro de Workers y en las pruebas de Node.
import { SEARCH_MODES } from './configuration.js';
import { structById, structByKey } from './structure-engine.js';
import { dist } from './utilities.js';
import { GAME_DATA } from './game-data.js';

// Tipos de condicion. cost = orden aproximado de coste (menor primero); better: 'low' (menor valor = mas raro) | 'high'.
export const LEAF_TYPES = {
  spawnBiome: { label: 'Bioma del spawn', cost: 1, better: null },
  stronghold: { label: 'Fortalezas', cost: 3, better: 'low' },
  structure: { label: 'Estructura', cost: 2, better: 'low' },
  structureNear: { label: 'Estructuras próximas entre sí', cost: 4, better: 'low' },
  biomeArea: { label: 'Biomas en un área', cost: 5, better: 'high' },
  biomeDiversity: { label: 'Diversidad de biomas', cost: 5, better: 'high' },
};

// Cubiomes (isViableStructureTerrain) solo aproxima el terreno para estos tipos y solo en 1.18+.
const TERRAIN_CHECK = new Set(['Desert_Pyramid', 'Jungle_Temple', 'Mansion'].map((k) => structByKey(k).id));

const MAX_REGIONS = 40000;

// ---- Turbo (opcional, aproximado) ----------------------------------------------------------------------------------
// Calcular el spawn cuesta ~4 ms por semilla (1.18+), casi todo el tiempo de una semilla. Con Turbo, antes de calcularlo se
// comprueba, de forma barata, si existe algun intento de estructura viable a <= radio + margen del ORIGEN. Si no existe,
// la semilla se descarta sin calcular el spawn. Es exacto mientras el spawn real este a <= margen del origen.
// spawnBound() da la cota teorica (lectura de getSpawn/estimateSpawn de Cubiomes): con margen >= cota, Turbo es exacto.
const VID = (k) => GAME_DATA.versions.find(([, kk]) => kk === k)?.[0];
export function spawnBound(mc) {
  mc = Number(mc);
  if (mc <= VID('MC_1_12_2')) return Infinity;      // paseo aleatorio sin cota teorica
  if (mc <= VID('MC_1_17_1')) return 800;           // locateBiome (256) + espiral de +-16 chunks
  return 2800;                                      // 1.18+: busqueda de 2048 + refinado de 512 + espiral de +-5 chunks
}
export const TURBO_DEFAULT_SLACK = 1000;            // en 4.500 spawns medidos (1.16, 1.18, 1.21) el maximo fue 987 bloques

/** true => esta hoja NO puede cumplirse si |spawn| <= slack. Solo es una condicion necesaria (no mira terreno ni minDist). */
function turboLeafRejects(ctx, leaf, slack) {
  if (leaf.cond !== 'structure' || leaf.center !== 'spawn' || !ctx.mode.viability) return false;
  const need = leaf.minCount ?? 1; if (need < 1) return false;
  const sdef = structById(leaf.struct), cfg = sdef && ctx.cfg(sdef.id); if (!cfg) return false;
  const R = leaf.radius + slack, rb = cfg.regionSize * 16;
  const r0x = Math.floor(-R / rb), r1x = Math.floor(R / rb);
  if ((r1x - r0x + 1) * (r1x - r0x + 1) > MAX_REGIONS) return false;
  ctx.ensureDim(sdef.dim);
  let got = 0;
  for (let rz = r0x; rz <= r1x; rz++) for (let rx = r0x; rx <= r1x; rx++) {
    const p = ctx.e.structPos(sdef.id, ctx.seed, rx, rz);
    if (!p || Math.hypot(p.x, p.z) > R) continue;
    if (ctx.e.viable(sdef.id, p.x, p.z) && ++got >= need) return false;
  }
  return true;
}

class SeedContext {
  constructor(engine, seed, mode) {
    this.e = engine; this.seed = seed; this.mode = SEARCH_MODES[mode]; this.modeKey = mode;
    this.dim = null; this._spawn = null; this._sh = null; this.cache = new Map();
  }
  ensureDim(d) { if (this.dim !== d) { this.e.apply(d, this.seed); this.dim = d; } }
  spawn() { if (!this._spawn) { this.ensureDim(0); this._spawn = this.e.spawn(); } return this._spawn; }
  center(c) { return c === 'origin' ? { x: 0, z: 0 } : this.spawn(); }
  strongholds() { if (!this._sh) { this.ensureDim(0); this._sh = this.e.strongholds(128); } return this._sh; }
  cfg(id) { const k = 'cfg' + id; if (!this.cache.has(k)) this.cache.set(k, this.e.structCfg(id)); return this.cache.get(k); }
}

/** Escanea intentos de generacion de una estructura alrededor de (cx,cz). Devuelve posiciones dentro del anillo [minD, radius]. */
export function scanStructure(ctx, sdef, cx, cz, radius, minD = 0) {
  const cfg = ctx.cfg(sdef.id);
  if (!cfg) return { found: [], unsupported: true, truncated: false };
  const rb = cfg.regionSize * 16;
  const r0x = Math.floor((cx - radius) / rb), r1x = Math.floor((cx + radius) / rb);
  const r0z = Math.floor((cz - radius) / rb), r1z = Math.floor((cz + radius) / rb);
  if ((r1x - r0x + 1) * (r1z - r0z + 1) > MAX_REGIONS) return { found: [], truncated: true };
  const found = [];
  const mode = ctx.mode;
  for (let rz = r0z; rz <= r1z; rz++) for (let rx = r0x; rx <= r1x; rx++) {
    const p = ctx.e.structPos(sdef.id, ctx.seed, rx, rz);
    if (!p) continue;
    const d = dist(cx, cz, p.x, p.z);
    if (d > radius || d < minD) continue;
    let verified = 'intento';
    if (mode.viability) {
      ctx.ensureDim(sdef.dim);
      if (!ctx.e.viable(sdef.id, p.x, p.z)) continue;
      verified = 'bioma';
      if (mode.terrain && TERRAIN_CHECK.has(sdef.id)) { if (!ctx.e.terrainOk(sdef.id, p.x, p.z)) continue; verified = 'bioma+terreno'; }
    }
    found.push({ x: p.x, z: p.z, d, verified });
  }
  found.sort((a, b) => a.d - b.d);
  return { found, truncated: false };
}

function sampleBiomes(ctx, cx, cz, radius) {
  const mode = ctx.mode;
  let s = mode.biomeScale[mode.biomeScale.length - 1];
  for (const cand of mode.biomeScale) { if (Math.pow((2 * radius) / cand, 2) <= mode.biomeCells) { s = cand; break; } }
  const x0 = Math.floor((cx - radius) / s), z0 = Math.floor((cz - radius) / s);
  const w = Math.ceil((2 * radius) / s) + 1;
  ctx.ensureDim(0);
  const area = ctx.e.area(s, x0, z0, w, w);
  const counts = new Map(); let total = 0;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const bx = (x0 + i) * s + s / 2, bz = (z0 + j) * s + s / 2;
    if (dist(cx, cz, bx, bz) > radius) continue;
    const id = area[j * w + i]; counts.set(id, (counts.get(id) || 0) + 1); total++;
  }
  return { counts, total, scale: s };
}

const idSet = (leaf) => leaf._set || (leaf._set = new Set(leaf.biomes || []));

const EVAL = {
  spawnBiome(leaf, ctx) {
    const sp = ctx.spawn();
    const b = ctx.e.biomeAt(sp.x, sp.z, { scale: 1, y: 63 });
    return { pass: idSet(leaf).has(b), metric: null, detail: { biome: b, spawn: sp }, verified: 'exacto' };
  },
  biomeArea(leaf, ctx) {
    const c = ctx.center(leaf.center), { counts, total, scale } = sampleBiomes(ctx, c.x, c.z, leaf.radius);
    const set = idSet(leaf); let hit = 0; const per = {};
    for (const [id, n] of counts) if (set.has(id)) { hit += n; per[id] = n; }
    const pct = total ? (100 * hit) / total : 0;
    const allOk = leaf.match === 'all' ? [...set].every((id) => (counts.get(id) || 0) > 0) : hit > 0;
    const pass = allOk && pct >= (leaf.minPct || 0);
    return { pass, metric: pct, detail: { pct, scale, per }, verified: `muestreo ${scale} bloques` };
  },
  biomeDiversity(leaf, ctx) {
    const c = ctx.center(leaf.center), { counts, scale } = sampleBiomes(ctx, c.x, c.z, leaf.radius);
    const n = counts.size;
    return { pass: n >= leaf.minDistinct, metric: n, detail: { distinct: n, scale }, verified: `muestreo ${scale} bloques` };
  },
  structure(leaf, ctx) {
    const sdef = structById(leaf.struct), c = ctx.center(leaf.center);
    const { found, unsupported, truncated } = scanStructure(ctx, sdef, c.x, c.z, leaf.radius, leaf.minDist || 0);
    const k = Math.max(1, leaf.minCount || 1);
    const pass = !unsupported && !truncated && found.length >= (leaf.minCount ?? 1) && (leaf.maxCount == null || found.length <= leaf.maxCount);
    const metric = found.length >= k ? found[k - 1].d : Infinity;
    return { pass, metric, detail: { count: found.length, found: found.slice(0, 16), unsupported, truncated }, verified: found[0]?.verified || (unsupported ? 'no disponible' : '—') };
  },
  stronghold(leaf, ctx) {
    const c = ctx.center(leaf.center);
    const list = ctx.strongholds().map((p) => ({ ...p, d: dist(c.x, c.z, p.x, p.z) })).filter((p) => p.d <= leaf.radius).sort((a, b) => a.d - b.d);
    const k = Math.max(1, leaf.minCount || 1);
    return { pass: list.length >= (leaf.minCount ?? 1), metric: list.length >= k ? list[k - 1].d : Infinity, detail: { count: list.length, found: list.slice(0, 16) }, verified: 'bioma (posición exacta de Cubiomes)' };
  },
  structureNear(leaf, ctx) {
    const a = structById(leaf.typeA), b = structById(leaf.typeB), c = ctx.center(leaf.center);
    const A = scanStructure(ctx, a, c.x, c.z, leaf.radius).found;
    let best = Infinity, pair = null;
    for (const pa of A) {
      const B = scanStructure(ctx, b, pa.x, pa.z, leaf.maxDist).found;
      for (const pb of B) {
        if (a.id === b.id && pa.x === pb.x && pa.z === pb.z) continue;
        const d = dist(pa.x, pa.z, pb.x, pb.z);
        if (d < best) { best = d; pair = { a: pa, b: pb, d }; }
      }
    }
    return { pass: best <= leaf.maxDist, metric: best, detail: { pair, countA: A.length }, verified: 'proximidad entre puntos de inicio (geometría no generada)' };
  },
};

const GROUP_OPS = new Set(['AND', 'OR', 'NOT']);

/** Prepara el arbol: ordena por prioridad/coste, separa condiciones opcionales y lista las hojas. */
export function compileRules(root) {
  const leaves = [], optional = [];
  const walk = (n) => {
    if (n.enabled === false) return null;
    if (n.kind === 'group') {
      if (!GROUP_OPS.has(n.op)) throw new Error('Operador desconocido: ' + n.op);
      const kids = n.children.map(walk).filter(Boolean);
      kids.sort((x, y) => (x.priority ?? 50) - (y.priority ?? 50) || cost(x) - cost(y));
      return { ...n, children: kids };
    }
    if (!EVAL[n.cond]) throw new Error('Tipo de condición desconocido: ' + n.cond);
    const leaf = { ...n }; leaves.push(leaf);
    if (n.optional) { optional.push(leaf); return null; }
    return leaf;
  };
  const cost = (n) => (n.kind === 'group' ? Math.max(0, ...n.children.map(cost)) + 0.5 : LEAF_TYPES[n.cond].cost + (n.radius ? Math.min(2, n.radius / 2000) : 0));
  return { root: walk(root) || { kind: 'group', op: 'AND', children: [] }, leaves, optional };
}

function evalNode(n, ctx, full, out) {
  if (n.kind !== 'group') {
    const r = EVAL[n.cond](n, ctx); out[n.id] = { cond: n.cond, ...r }; return r.pass;
  }
  const ks = n.children;
  if (n.op === 'NOT') { let any = false; for (const k of ks) { const p = evalNode(k, ctx, full, out); if (p) any = true; if (!full && any) break; } return !any; }
  if (n.op === 'AND') { let ok = true; for (const k of ks) { if (!evalNode(k, ctx, full, out)) { ok = false; if (!full) break; } } return ok; }
  let ok = ks.length === 0; for (const k of ks) { if (evalNode(k, ctx, full, out)) { ok = true; if (!full) break; } } return ok;
}

/**
 * Evalua una semilla. full=true evalua todas las hojas (calibracion y registro de coincidencias).
 * Devuelve { pass, leaves } y, si pasa, el registro completo de la semilla.
 */
/** Etapas del filtro: los hijos del AND raiz (en orden de evaluacion) o la raiz entera si no es un AND. */
export function stagesOf(compiled) {
  const r = compiled.root;
  return r.kind === 'group' && r.op === 'AND' ? r.children : [r];
}

/**
 * stageStats (opcional): [{n,k,ms}] por etapa. n cuenta solo semillas que LLEGARON a la etapa (regla de la cadena);
 * ms es el tiempo gastado en ella. Sirve para estimar la frecuencia y para medir el rendimiento de cada filtro.
 */
export function evaluateSeed(engine, compiled, seed, mode, full = false, stageStats = null, turbo = null) {
  const ctx = new SeedContext(engine, seed, mode);
  if (turbo && !full) {
    // Turbo solo sobre las condiciones de estructura centradas en el spawn del primer nivel del AND (nunca en calibracion).
    for (const st of stagesOf(compiled)) if (st.kind !== 'group' && turboLeafRejects(ctx, st, turbo.slack)) return { pass: false, leaves: {}, prefiltered: true };
  }
  const out = {};
  let pass;
  const r0 = compiled.root;
  if (stageStats) {
    const stages = stagesOf(compiled);
    pass = true;
    let reached = true;
    for (let i = 0; i < stages.length; i++) {
      const t = performance.now();
      const ok = evalNode(stages[i], ctx, full, out);
      if (reached) { const st = stageStats[i]; st.n++; st.ms += performance.now() - t; if (ok) st.k++; else reached = false; }
      if (!ok) { pass = false; if (!full) break; }
    }
  } else pass = evalNode(r0, ctx, full, out);
  if (!pass && !full) return { pass: false, leaves: out };
  let leaves = out;
  if (pass && !full) { leaves = {}; evalNode(compiled.root, ctx, true, leaves); }
  for (const l of compiled.optional) if (!(l.id in leaves)) { const r = EVAL[l.cond](l, ctx); leaves[l.id] = { cond: l.cond, ...r, optional: true }; }
  if (full) for (const l of compiled.leaves) if (!(l.id in leaves)) { const r = EVAL[l.cond](l, ctx); leaves[l.id] = { cond: l.cond, ...r }; }
  if (!pass) return { pass: false, leaves };
  const sp = ctx.spawn();
  const record = { seed: String(seed), spawn: sp, spawnBiome: engine.biomeAt(sp.x, sp.z, { scale: 1, y: 63 }), leaves };
  return { pass: true, leaves, record };
}

/** Contexto de semilla para consultas sueltas (mapa). */
export function makeContext(engine, seed, mode = 'normal') { return new SeedContext(engine, seed, mode); }
