// Pruebas de las condiciones de spawn (forma de tierra, relieve/altura) y del registro de versiones 26.x. Ejecutar: node tests-extension.js
import fs from 'node:fs';
import { WasmEngine } from './wasm-engine.js';
import { VERSIONS } from './minecraft-versions.js';
import { EXTRA_VERSIONS, LEVELS, extraByTag } from './version-support.js';
import { compileRules, evaluateSeed, makeContext } from './search-engine.js';
import { newLeaf, newGroup, validateRules } from './app-state.js';
import { describeLeaf } from './rarity-engine.js';
import * as F from './feasibility-engine.js';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' ' + extra); } };
const V = (key) => VERSIONS.find((v) => v.key === key).id;
const e = await WasmEngine.fromBytes(fs.readFileSync('seedhunter-engine.wasm'));
const seeds = (n, s0 = 777n) => { let s = s0; const out = []; for (let i = 0; i < n; i++) { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); out.push(BigInt.asIntN(64, s).toString()); } return out; };
const run = (version, cond, extra, mode, list) => {
  e.setup(V(version));
  const rules = newGroup('AND', [newLeaf(cond, extra)]); const c = compileRules(JSON.parse(JSON.stringify(rules)));
  return list.map((sd) => evaluateSeed(e, c, sd, mode, true));
};

console.log('Altura aproximada (sh_height)');
e.setup(V('MC_1_21_1')); e.apply(0, '777');
const g = e.heights(-16, -16, 32, 32);
ok(g && g.y.length === 1024 && g.ids.length === 1024, 'Devuelve una rejilla 32x32 con alturas y biomas');
ok([...g.y].every((v) => Number.isFinite(v) && v > 0 && v < 260), 'Alturas finitas y en rango plausible');
e.apply(0, '777'); const g2 = e.heights(-16, -16, 32, 32);
ok(g.y.every((v, i) => v === g2.y[i]), 'Determinista: misma seed => mismas alturas');
const ocean = (() => { for (const sd of seeds(40)) { e.apply(0, sd); for (let x = -300; x < 300; x += 20) { const h = e.heights(x, 0, 2, 2); if (h.ids[0] === 24) return h.y[0]; } } return null; })();
ok(ocean !== null && ocean < 63, `Un oceano profundo queda por debajo del nivel del mar (${ocean?.toFixed(1)})`);
e.setup(V('MC_1_17_1')); e.apply(0, '777');
ok(e.heights(0, 0, 4, 4) === null, 'En 1.17 no hay altura aproximada (devuelve null, no inventa)');
e.setup(V('MC_1_21_1')); e.apply(1, '777'); ok(e.heights(0, 0, 4, 4) === null, 'En el Nether tampoco');

console.log('Condicion «Altura / relieve del spawn»');
const L = seeds(150);
const flat = run('MC_1_21_1', 'spawnTerrain', { maxRange: 6 }, 'normal', L), high = run('MC_1_21_1', 'spawnTerrain', { maxRange: null, minHeight: 90 }, 'normal', L);
const nf = flat.filter((r) => r.pass).length, nh = high.filter((r) => r.pass).length;
ok(nf > 0 && nf < L.length * 0.5, `Plano (relieve <= 6): ${nf}/150 semillas, ni todas ni ninguna`);
ok(nh > 0 && nh < L.length * 0.5, `Elevado (altura media >= 90): ${nh}/150 semillas`);
const both = run('MC_1_21_1', 'spawnTerrain', { maxRange: 6, minHeight: 90 }, 'normal', L).filter((r) => r.pass).length;
ok(both <= Math.min(nf, nh), `Plano Y elevado a la vez es mas raro que cada uno (${both})`);
const one = flat.find((r) => r.pass); const d = Object.values(one.leaves)[0];
ok(d.detail.range <= 6 && d.verified.includes('aproximada'), 'El detalle guarda el relieve medido y se etiqueta como aproximado');
ok(run('MC_1_17_1', 'spawnTerrain', { maxRange: 6 }, 'normal', L.slice(0, 5)).every((r) => !r.pass), 'En 1.17 la condicion nunca se cumple (no se simula)');

console.log('Condicion «Forma de tierra del spawn»');
const forms = (mode, extra = {}) => ['island', 'continent', 'peninsula'].map((f) => run('MC_1_21_1', 'spawnLandform', { form: f, ...extra }, mode, L.slice(0, 60)).filter((r) => r.pass).length);
const fm = forms('advanced');
ok(fm.every((n) => n >= 0) && fm[0] + fm[1] + fm[2] <= 60, `Las tres formas son excluyentes: isla ${fm[0]}, continente ${fm[1]}, peninsula ${fm[2]} (de 60)`);
ok(fm[1] > 0, 'Hay semillas con spawn en continente');
const rec = run('MC_1_21_1', 'spawnLandform', { form: 'continent' }, 'advanced', L.slice(0, 40)).map((r) => Object.values(r.leaves)[0]);
ok(rec.every((r) => r.verified.includes('estimación por muestreo')), 'Siempre se etiqueta como estimacion por muestreo');
ok(rec.every((r) => !r.detail.area || r.detail.form !== 'island' || r.detail.area <= 1000000), 'Una «isla» nunca supera el area maxima');
const strict = run('MC_1_21_1', 'spawnLandform', { form: 'island', maxIslandArea: 100 }, 'advanced', L.slice(0, 40)).filter((r) => r.pass).length;
ok(strict <= fm[0], 'Reducir el area maxima de isla no puede aumentar las islas');
const coastal = run('MC_1_21_1', 'spawnLandform', { form: 'peninsula', minWaterFrac: 0.9 }, 'advanced', L.slice(0, 40)).filter((r) => r.pass).length;
ok(coastal <= fm[2], 'Exigir mas agua no puede aumentar las peninsulas');

console.log('Reglas, descripcion y viabilidad');
ok(describeLeaf(newLeaf('spawnLandform', { form: 'island' })).includes('una isla'), 'Descripcion legible de forma de tierra');
ok(describeLeaf(newLeaf('spawnTerrain')).includes('relieve ≤ 6'), 'Descripcion legible de relieve');
ok(validateRules(newGroup('AND', [newLeaf('spawnLandform', { scanRadius: 0 })])).length === 1, 'Valida la ventana de analisis');
e.setup(V('MC_1_17_1'));
const imp = F.analyzeImpossibility(JSON.parse(JSON.stringify(newGroup('AND', [newLeaf('spawnTerrain')]))), F.engineInfo(e));
ok(imp.unsat && imp.code === 'B', 'Demostrado (B): la altura aproximada no existe antes de 1.18');
e.setup(V('MC_1_21_1'));
ok(!F.analyzeImpossibility(JSON.parse(JSON.stringify(newGroup('AND', [newLeaf('spawnTerrain')]))), F.engineInfo(e)).unsat, 'En 1.21 no se declara imposible');
const bad = F.analyzeImpossibility(JSON.parse(JSON.stringify(newGroup('AND', [newLeaf('spawnTerrain', { minHeight: 100, maxHeight: 80, maxRange: null })]))), F.engineInfo(e));
ok(bad.unsat && bad.code === 'A', 'Demostrado (A): altura minima mayor que la maxima');

console.log('Registro de versiones 26.x');
ok(EXTRA_VERSIONS.length >= 3 && new Set(EXTRA_VERSIONS.map((v) => v.tag)).size === EXTRA_VERSIONS.length, 'Etiquetas unicas');
ok(EXTRA_VERSIONS.every((v) => VERSIONS.some((x) => x.key === v.engineKey) && LEVELS[v.level]), 'Cada version apunta a un motor real y a un nivel declarado');
ok(extraByTag('26.3').differences.some((t) => t.includes('Dappled')) && extraByTag('26.3').level === 'approximate', '26.3 declara Dappled Forest y se marca aproximada');
ok(EXTRA_VERSIONS.every((v) => v.level === 'data-equivalent' ? v.differences.length === 0 : v.differences.length > 0), 'Equivalente en datos <=> sin diferencias conocidas');
ok(EXTRA_VERSIONS.every((v) => v.unverified.length > 0), 'Ninguna version se presenta como verificada contra el juego');
const files = fs.readdirSync('.');
ok(files.includes('check-version-data.py') && files.every((f) => fs.statSync(f).isFile()), 'Herramienta de comparacion de versiones presente y sin carpetas');
const sw = fs.readFileSync('sw.js', 'utf8');
ok(['version-support.js', 'tests-extension.js'].every((f) => f === 'tests-extension.js' || sw.includes(f)), 'El service worker cachea version-support.js');

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
