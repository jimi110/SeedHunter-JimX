// Pruebas de SeedHunter Jimx. Ejecutar: node tests.js   (Node >= 18, sin dependencias)
// Solo se informa de lo que realmente se ejecuta. Las pruebas de GPU y de navegador no se ejecutan aqui (ver README).
import fs from 'node:fs';
import { WasmEngine } from './wasm-engine.js';
import { VERSIONS } from './minecraft-versions.js';
import { structByKey } from './structure-engine.js';
import { compileRules, evaluateSeed } from './search-engine.js';
import { wilson, upperBoundZero, formatOneIn, classify, proportionSummary, percentile } from './rarity-engine.js';
import { parseSeed } from './utilities.js';
import { buildTxt } from './export-engine.js';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' ' + extra); } };
const close = (a, b, eps) => Math.abs(a - b) <= eps;
const V = (key) => VERSIONS.find((v) => v.key === key).id;

console.log('Estadistica');
{
  const w = wilson(5, 1000);
  ok(close(w.p, 0.005, 1e-12) && w.lo < 0.005 && w.hi > 0.005, 'Wilson contiene la proporcion');
  ok(close(w.lo, 0.00214, 2e-4) && close(w.hi, 0.01166, 3e-4), 'Wilson 5/1000 = [0.214 %, 1.166 %]', JSON.stringify(w));
  ok(close(upperBoundZero(1000), 0.002987, 1e-5), 'Limite superior 0/1000 (95 %) ~ 0.299 %');
  const z = proportionSummary(0, 1e6);
  ok(z.zero && !('p' in z) && !('oneIn' in z), 'Cero coincidencias: no se inventa frecuencia');
  ok(formatOneIn(5 / 1e6) === '1 entre 200.000', 'Ejemplo del enunciado: 5 de 1.000.000 => 1 entre 200.000', formatOneIn(5 / 1e6));
  ok(classify(5e-7).label === 'Extremadamente rara' || classify(5e-7).label === 'Excepcional', 'Clasificacion por umbrales');
  ok(percentile([1, 2, 3], 1, 'low').insufficient, 'Percentil con muestra insuficiente se marca');
}

console.log('Semillas');
ok(parseSeed('12345') === 12345n && parseSeed('-1') === -1n, 'Seed numerica');
ok(parseSeed('hello') === 99162322n, 'Seed de texto = hashCode de Java ("hello" = 99162322)');
ok(parseSeed('18446744073709551615') === -1n, 'Desbordamiento a 64 bits con signo');

console.log('Motor WebAssembly (Cubiomes)');
const wasmFiles = ['seedhunter-engine.wasm', 'seedhunter-engine-simd.wasm'];
const engines = {};
for (const f of wasmFiles) { engines[f] = await WasmEngine.fromBytes(fs.readFileSync(f)); ok(true, 'carga ' + f); }
const e = engines[wasmFiles[0]];

// Valores de referencia generados con Cubiomes NATIVO (gcc): ver reference-generator.c y README, apartado Validacion.
const REF = JSON.parse(fs.readFileSync('reference-values.json', 'utf8'));
for (const r of REF.cases) {
  for (const f of wasmFiles) {
    const tag = f.includes('simd') ? 'SIMD ' : '';
    const en = engines[f]; en.setup(V(r.version)); en.apply(0, BigInt(r.seed));
    const sp = en.spawn();
    ok(sp.x === r.spawn[0] && sp.z === r.spawn[1], `${tag}${r.version} seed ${r.seed}: spawn`, `${sp.x},${sp.z}`);
    ok(en.biomeAt(0, 0, { scale: 1, y: 63 }) === r.biome0 && en.biomeAt(-3000, 2500, { scale: 1, y: 63 }) === r.biome1, `${tag}${r.version} seed ${r.seed}: biomas`);
    for (const s of r.structs) {
      const id = structByKey(s.key).id;
      const p = en.structPos(id, BigInt(r.seed), s.rx, s.rz);
      const v = p ? en.viable(id, p.x, p.z) : false;
      ok(!!p === s.has && (!p || (p.x === s.x && p.z === s.z && v === s.viable)), `${tag}${r.version} seed ${r.seed}: ${s.key} region ${s.rx},${s.rz}`);
    }
  }
}

console.log('Versiones');
e.setup(V('MC_1_16_5')); ok(!e.structCfg(structByKey('Ancient_City').id), 'Ancient City no existe en 1.16.5');
ok(!e.structCfg(structByKey('Trial_Chambers').id), 'Trial Chambers no existe en 1.16.5');
e.setup(V('MC_1_21_1')); ok(!!e.structCfg(structByKey('Ancient_City').id), 'Ancient City existe en 1.21.1');
ok(!!e.structCfg(structByKey('Trial_Chambers').id), 'Trial Chambers existe en 1.21.1');
e.apply(0, 1n);
ok(e.strongholds(3).length === 3, 'Fortalezas: 3 posiciones');
ok(e.strongholds(128).length === 128, '128 fortalezas generadas');

console.log('Motor de reglas');
{
  e.setup(V('MC_1_21_1'));
  const leaf = (id, extra) => ({ kind: 'leaf', id, enabled: true, center: 'spawn', ...extra });
  const m = (id) => leaf(id, { cond: 'structure', struct: structByKey('Mansion').id, minCount: 1, radius: 1200 });
  const vil = leaf('b', { cond: 'structure', struct: structByKey('Village').id, minCount: 1, radius: 800 });
  const grp = (op, children) => compileRules({ kind: 'group', op, id: 'r', enabled: true, children });
  const count = (c, mode, n = 300) => { const o = []; for (let s = 0n; s < BigInt(n); s++) if (evaluateSeed(e, c, s, mode).pass) o.push(Number(s)); return o; };

  const hits = count(grp('AND', [m('a')]), 'normal');
  ok(hits.length > 0 && JSON.stringify(hits) === JSON.stringify(REF.mansionHits), `Mansion <=1200 bloques: ${hits.length} semillas, identicas a Cubiomes nativo`, hits.slice(0, 8).join(','));
  ok(count(grp('NOT', [m('a')]), 'normal').length === 300 - hits.length, 'NOT es el complemento exacto de la condicion');
  ok(count(grp('OR', [m('a'), vil]), 'normal').length >= hits.length, 'OR devuelve al menos tantas semillas como cada rama');
  ok(count(grp('AND', [m('a'), vil]), 'normal').length <= hits.length, 'AND devuelve como mucho las de cada rama');
  ok(count(grp('AND', [m('a')]), 'fast', 200).length >= count(grp('AND', [m('a')]), 'normal', 200).length, 'Modo rapido (sin viabilidad) no descarta mas que el normal');
  const rec = evaluateSeed(e, grp('AND', [m('a')]), BigInt(hits[0]), 'normal');
  ok(rec.pass && rec.record.leaves.a.verified === 'bioma', 'Estructura marcada como verificada por bioma (no por geometria)');
}

console.log('Exportacion y privacidad');
{
  const card = { seed: '1', joint: { p: 0.01, k: 10, n: 1000, hi: 0.02, lo: 0.005 }, tier: { label: 'Frecuente' }, perLeaf: [], explanation: ['x'], domain: { text: 'd' } };
  const txt = buildTxt([card], new Map([['1', { spawn: { x: 1, z: 2 }, spawnBiome: 1 }]]), { edition: 'Java Edition', versionLabel: '1.21.1', modeLabel: 'Normal', leaves: [] }, ['version', 'spawn', 'rarity']);
  ok(txt.includes('SEED: 1') && txt.includes('1 entre 100') && txt.includes('ESTIMADO'), 'TXT contiene seed, frecuencia y marca de spawn estimado');
  const forbidden = /\b(localStorage|sessionStorage|indexedDB)\s*[.\[]|document\.cookie|sendBeacon|new\s+XMLHttpRequest|new\s+WebSocket|new\s+EventSource/; // uso real de la API (la pestana de Privacidad solo las menciona en texto)
  const strip = (t) => t.replace(/\/\/.*$/gm, '');
  const files = fs.readdirSync('.').filter((f) => f.endsWith('.js') && f !== 'tests.js');
  ok(files.filter((f) => forbidden.test(strip(fs.readFileSync(f, 'utf8')))).length === 0, 'Ningun modulo usa almacenamiento persistente ni canales de envio');
  ok(files.filter((f) => /fetch\(/.test(fs.readFileSync(f, 'utf8'))).every((f) => f === 'wasm-engine.js'), 'Solo wasm-engine.js usa fetch (carga el .wasm local)');
  const html = fs.readFileSync('index.html', 'utf8');
  ok(/connect-src 'self'/.test(html) && !/(src|href)="https?:/.test(html), 'CSP limita conexiones al propio origen; sin recursos externos');
  const dirs = fs.readdirSync('.', { withFileTypes: true }).filter((d) => d.isDirectory() && !['node_modules', '.git'].includes(d.name));
  ok(dirs.length === 0, 'No hay carpetas de codigo en la raiz', dirs.map((d) => d.name).join(','));
}

console.log(`\n${pass} correctas, ${fail} fallidas`);
console.log('No ejecutado aqui: WebGPU (solo se detecta), interfaz en navegador (prueba manual) y contraste con otras herramientas externas.');
process.exit(fail ? 1 : 0);
