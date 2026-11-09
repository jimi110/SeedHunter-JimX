// Estado de la aplicacion: SOLO en memoria (sin localStorage/sessionStorage/IndexedDB/cookies). Se pierde al recargar.
import { DEFAULT_VERSION } from './minecraft-versions.js';
import { DEFAULT_RARITY_TIERS, ACCENTS, CALIBRATION_EVERY } from './configuration.js';
import { structByKey } from './structure-engine.js';
import { uid } from './utilities.js';

export const state = {
  edition: 'java',
  versionId: DEFAULT_VERSION.id,
  versionTag: null,       // '26.1' / '26.2' / '26.3' = version posterior servida por el motor 1.21 WD (ver version-support.js)
  large: false,
  mode: 'normal',
  domain: { kind: 'random', count: '', start: '0', end: '99999', list: '' },
  maxMatches: '', searchName: 'Búsqueda 1',
  calibEvery: CALIBRATION_EVERY,
  profile: 'high',
  turbo: false, turboSlack: 1000,
  workersOverride: '',
  enginePref: 'auto',
  tiers: structuredClone(DEFAULT_RARITY_TIERS),
  theme: 'dark', accent: ACCENTS[0], uiSize: 'medium',
  rules: null,
  matches: [],            // registros devueltos por los workers
  searchSnapshot: null,   // ultimo progreso + dominio + calibracion
  selected: new Set(),
  sortKey: 'rare', sortDir: 1, filter: '',
  lastRun: null,          // { versionId, mode, ... } de la busqueda en curso/terminada
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const notify = (what) => subs.forEach((fn) => fn(what));

export const newGroup = (op = 'AND', children = []) => ({ kind: 'group', id: uid('g'), op, children, enabled: true, priority: 50 });
export function newLeaf(cond, extra = {}) {
  const base = { kind: 'leaf', id: uid('c'), cond, enabled: true, optional: false, priority: 50, center: 'spawn' };
  const defaults = {
    spawnBiome: { biomes: [] },
    biomeArea: { biomes: [], match: 'any', radius: 400, minPct: 0 },
    biomeDiversity: { minDistinct: 8, radius: 500 },
    spawnLandform: { form: 'island', scanRadius: 1500, maxIslandArea: 1000000, peninsulaRadius: 400, minWaterFrac: 0.35 },
    spawnTerrain: { radius: 32, maxRange: 6, minHeight: null, maxHeight: null },
    structure: { struct: structByKey('Village').id, minCount: 1, maxCount: null, radius: 800, minDist: 0 },
    stronghold: { minCount: 1, radius: 1500 },
    structureNear: { typeA: structByKey('Mansion').id, typeB: structByKey('Ancient_City').id, radius: 1500, maxDist: 300 },
  };
  return { ...base, ...structuredClone(defaults[cond]), ...extra };
}
export function defaultRules() {
  return newGroup('AND', [
    newLeaf('structure', { struct: structByKey('Mansion').id, radius: 1500 }),
    newLeaf('structure', { struct: structByKey('Village').id, radius: 800 }),
  ]);
}
state.rules = defaultRules();

export function cloneNode(n) {
  const c = structuredClone(n); c.id = uid(n.kind === 'group' ? 'g' : 'c'); delete c._set;
  if (c.children) c.children = n.children.map(cloneNode);
  return c;
}
export function findParent(root, id) {
  for (const k of root.children || []) { if (k.id === id) return root; if (k.kind === 'group') { const p = findParent(k, id); if (p) return p; } }
  return null;
}
export function collectLeaves(root, out = []) {
  for (const k of root.children || []) k.kind === 'group' ? collectLeaves(k, out) : out.push(k);
  return out;
}
/** Valida el arbol antes de buscar. Devuelve lista de errores legibles. */
export function validateRules(root) {
  const errs = [], leaves = collectLeaves(root).filter((l) => l.enabled !== false);
  if (!leaves.length) errs.push('Añade al menos una condición activa.');
  for (const l of leaves) {
    if ((l.cond === 'spawnBiome' || l.cond === 'biomeArea') && !l.biomes.length) errs.push('Una condición de bioma no tiene biomas seleccionados.');
    if (l.cond === 'spawnLandform' && !(l.scanRadius > 0)) errs.push('La ventana de análisis debe ser mayor que 0.');
    if (l.radius !== undefined && !(l.radius > 0)) errs.push('Un radio debe ser mayor que 0.');
    if (l.cond === 'structureNear' && !(l.maxDist > 0)) errs.push('La distancia máxima entre estructuras debe ser mayor que 0.');
  }
  return errs;
}
